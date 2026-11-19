"""Authenticated leaderboard/statistics administration and private archives."""
import base64
import binascii
from datetime import datetime
import json
import math
from pathlib import Path
import secrets
import time
from excel_io import read_table, export_book, archive_data
from game_sessions import APIError
from stats_state import snapshot, replace as replace_statistics

KINDS={'leaderboard','statistics'}


def integer(value, maximum=10**12):
    try:
        number=float(value)
        if not math.isfinite(number) or number!=int(number) or not 0<=number<=maximum: raise ValueError()
        return int(number)
    except (TypeError,ValueError,OverflowError):
        raise ValueError('Expected a non-negative whole number within the allowed range.') from None


def leaderboard_rows(table):
    if not table: raise ValueError('The workbook is empty.')
    headers=[str(x).strip().casefold() for x in table[0]]
    aliases={'name':{'name','participant','participant name','nazwa','imię'},'email':{'email','e-mail'},'score':{'points','score','punkty'},'hidden':{'hidden'}}
    columns={key:next((i for i,h in enumerate(headers) if h in labels),None) for key,labels in aliases.items()}
    if any(columns[k] is None for k in ('name','email','score')): raise ValueError('Required columns: Name, Email, Points.')
    rows=[]
    for index,row in enumerate(table[1:],2):
        def val(key):
            col=columns[key]; return row[col] if col is not None and col<len(row) else ''
        name,email=str(val('name')).strip(),str(val('email')).strip()
        if not name or len(name)>100 or len(email)>254 or (email and '@' not in email): raise ValueError(f'Invalid name or email in row {index}.')
        hidden=str(val('hidden')).strip().casefold()
        if hidden not in {'','no','yes','false','true','0','1'}: raise ValueError(f'Invalid Hidden value in row {index}.')
        rows.append({'id':'import-'+secrets.token_urlsafe(24),'name':name,'email':email,'normalizedName':' '.join(name.casefold().split()),'score':integer(val('score'),1000),'accuracy':0,'mistakes':0,'timestamp':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'hidden':hidden in {'yes','true','1'},'verification':'admin-import'})
    if not rows: raise ValueError('The leaderboard must contain at least one participant.')
    return rows


def statistics_rows(table):
    if not table or [str(x).strip().casefold() for x in table[0][:2]]!=['metric','value']: raise ValueError('Required statistics columns: Metric, Value, Email, Completed games.')
    value={'players':[]}; keys={'visits':'visits','play time (ms)':'playMs','completed games':'games','since':'since'}
    for row in table[1:]:
        label=str(row[0]).strip().casefold(); v=row[1] if len(row)>1 else ''
        if label=='player':
            name=str(v).strip(); email=str(row[2] if len(row)>2 else '').strip(); count=integer(row[3] if len(row)>3 else '')
            if not name or len(name)>100 or len(email)>254 or (email and '@' not in email): raise ValueError('Invalid player in statistics.')
            value['players'].append({'name':name,'email':email,'count':count})
        elif label in keys:
            key=keys[label]
            if key in value: raise ValueError('Duplicate statistics metric.')
            if key=='since':
                try: datetime.fromisoformat(str(v).replace('Z','+00:00'))
                except ValueError: raise ValueError('Since must be an ISO date and time.') from None
                value[key]=str(v)
            else: value[key]=integer(v,10**15 if key=='playMs' else 10**12)
        else: raise ValueError('Unknown statistics metric.')
    if not {'visits','playMs','games'}<=value.keys(): raise ValueError('Missing statistics metrics.')
    if sum(p['count'] for p in value['players'])>value['games']: raise ValueError('Player completions exceed total games.')
    ids=[(p['email'] or p['name']).casefold() for p in value['players']]
    if len(ids)!=len(set(ids)): raise ValueError('Duplicate statistics player.')
    value.setdefault('since',time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
    return value


def read_upload(data):
    if data.get('kind') not in KINDS or not isinstance(data.get('file'),str): raise ValueError('Choose a leaderboard or statistics .xlsx file.')
    try: raw=base64.b64decode(data['file'],validate=True)
    except (binascii.Error,ValueError): raise ValueError('Invalid file upload.') from None
    table=read_table(raw)
    return leaderboard_rows(table) if data['kind']=='leaderboard' else statistics_rows(table)


def manager(handler,kind):
    if kind not in KINDS: raise ValueError('Invalid backup category.')
    return handler.server.backups if kind=='leaderboard' else handler.server.statistics_backups


def current(db,kind):
    return [json.loads(row[0]) for row in db.execute('SELECT payload FROM runs')] if kind=='leaderboard' else snapshot(db)


def archive_file(handler,kind,name):
    folder=manager(handler,kind).directory
    if not name or Path(name).name!=name or not name.endswith('.xlsx'): raise ValueError('Invalid backup name.')
    path=folder/name
    if path.is_symlink() or path.resolve().parent!=folder or not path.is_file(): raise APIError(404,'Backup not found.')
    return path


def get(db,handler,route,query):
    kind=query.get('kind',['leaderboard'])[0]
    if kind not in KINDS: raise ValueError('Invalid backup category.')
    if route=='/api/panel/export':
        return export_book(kind,current(db,kind)),f'{kind.title()} - {datetime.now().strftime("%d.%m.%Y")}.xlsx'
    if route=='/api/panel/backups':
        folder=manager(handler,kind).directory
        files=[{'name':p.name,'size':p.stat().st_size,'created':datetime.fromtimestamp(p.stat().st_mtime).astimezone().isoformat()} for p in folder.glob('*.xlsx') if p.is_file() and not p.is_symlink()]
        return {'files':sorted(files,key=lambda f:(f['created'],f['name']),reverse=True),'timezone':str(manager(handler,kind).zone or 'server local time')},None
    path=archive_file(handler,kind,query.get('name',[''])[0]); raw=path.read_bytes()
    if route=='/api/panel/backup/download': return raw,path.name
    value=archive_data(raw,kind)
    if value is None: value=leaderboard_rows(read_table(raw)) if kind=='leaderboard' else statistics_rows(read_table(raw))
    return {'kind':kind,'name':path.name,'data':value},None


def post(db,handler,route,data):
    if not isinstance(data,dict): raise ValueError('Expected JSON object.')
    if route=='/api/panel/visibility':
        if not isinstance(data.get('id'),str) or type(data.get('hidden')) is not bool: raise ValueError('Invalid visibility change.')
        row=db.execute('SELECT payload FROM runs WHERE id=?',(data['id'],)).fetchone()
        if not row: raise APIError(404,'Result not found.')
        run=json.loads(row[0]);run['hidden']=data['hidden']
        db.execute('UPDATE runs SET payload=? WHERE id=?',(json.dumps(run),data['id']))
        return {'saved':True,'hidden':run['hidden']}
    if route in {'/api/panel/import-preview','/api/panel/import'}:
        value=read_upload(data);kind=data['kind']
        if route.endswith('preview'): return {'kind':kind,'data':value}
        if data.get('confirmation')!='REPLACE': raise ValueError('Confirm replacement first.')
        backup=manager(handler,kind).create(current(db,kind))
        if kind=='leaderboard':
            db.execute('INSERT OR IGNORE INTO deleted_runs SELECT id FROM runs')
            db.execute('DELETE FROM runs')
            db.executemany('INSERT INTO runs VALUES (?,?)',[(r['id'],json.dumps(r)) for r in value])
        else: replace_statistics(db,value)
        return {'saved':True,'backup':backup}
    if route=='/api/panel/statistics/reset':
        if data.get('confirmation')!='RESET': raise ValueError('Confirm statistics reset first.')
        backup=manager(handler,'statistics').create(snapshot(db))
        replace_statistics(db,{'visits':0,'playMs':0,'games':0,'players':[]})
        return {'saved':True,'backup':backup}
    raise APIError(404,'Not found')
