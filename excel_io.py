"""Bounded, dependency-free OOXML import/export. Formulas are never evaluated."""
from io import BytesIO
import json
import math
import posixpath
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED, BadZipFile

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def table_book(headers, rows, kind, data):
    def cell(value, ref):
        if type(value) in (int, float) and math.isfinite(value):
            return f'<c r="{ref}"><v>{value}</v></c>'
        text = escape(''.join(c for c in str(value if value is not None else '') if ord(c) >= 32 or c in '\t\n\r'))
        return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'
    sheet = ''.join(f'<row r="{i}">'+''.join(cell(v, f'{chr(65+j)}{i}') for j,v in enumerate(row))+'</row>' for i,row in enumerate([headers]+rows,1))
    files = {
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="json" ContentType="application/json"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':f'<workbook xmlns="{NS["s"]}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{kind.title()}" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml':f'<worksheet xmlns="{NS["s"]}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="6" width="30" customWidth="1"/></cols><sheetData>{sheet}</sheetData></worksheet>',
    }
    out = BytesIO()
    with ZipFile(out,'w',ZIP_DEFLATED) as z:
        for name,xml in files.items():
            z.writestr(name,'<?xml version="1.0" encoding="UTF-8"?>'+xml)
        z.writestr('ceva/snapshot.json',json.dumps({'version':1,'kind':kind,'data':data},ensure_ascii=False))
    return out.getvalue()


def export_book(kind, data):
    if kind == 'leaderboard':
        return table_book(['Name','Email','Points','Hidden'], [[r.get('name',''),r.get('email',''),r.get('score',0),'Yes' if r.get('hidden') else 'No'] for r in data],kind,data)
    return table_book(['Metric','Value','Email','Completed games'], [['Visits',data['visits']],['Play time (ms)',data['playMs']],['Completed games',data['games']],['Since',data.get('since','')]]+[['Player',p['name'],p['email'],p['count']] for p in data.get('players',[])],kind,data)


def open_book(payload):
    if not payload or len(payload)>5_000_000:
        raise ValueError('Choose an .xlsx file smaller than 5 MB.')
    try:
        z = ZipFile(BytesIO(payload))
        infos = z.infolist()
        if len(infos)>200 or len({i.filename for i in infos})!=len(infos) or sum(i.file_size for i in infos)>24_000_000 or any(i.flag_bits&1 for i in infos):
            raise ValueError('Workbook is too large or encrypted.')
        return z
    except BadZipFile:
        raise ValueError('A valid .xlsx workbook is required.') from None


def read_table(payload):
    with open_book(payload) as z:
        def xml(name):
            raw=z.read(name)
            if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
                raise ValueError('Unsupported XML declarations.')
            return ET.fromstring(raw)
        try:
            strings=[''.join(t.text or '' for t in n.findall('.//s:t',NS)) for n in xml('xl/sharedStrings.xml').findall('s:si',NS)] if 'xl/sharedStrings.xml' in z.namelist() else []
            book=xml('xl/workbook.xml'); first=book.find('s:sheets/s:sheet',NS)
            rid=first.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            rel=next(n for n in xml('xl/_rels/workbook.xml.rels') if n.get('Id')==rid)
            if rel.get('TargetMode')=='External':
                raise ValueError('External worksheet links are not supported.')
            target=rel.get('Target',''); path=posixpath.normpath(target.lstrip('/') if target.startswith('/') else 'xl/'+target)
            if not path.startswith('xl/'):
                raise ValueError('Invalid worksheet location.')
            rows=[]
            for row in xml(path).findall('s:sheetData/s:row',NS):
                values={}
                for c in row.findall('s:c',NS):
                    if c.find('s:f',NS) is not None:
                        raise ValueError('Replace formulas with values before uploading.')
                    ref=c.get('r',''); letters=''.join(ch for ch in ref if ch.isalpha()); col=0
                    for ch in letters: col=col*26+ord(ch.upper())-64
                    if not 1<=col<=32: raise ValueError('Use at most 32 columns.')
                    v=c.find('s:v',NS); text=v.text if v is not None else ''
                    value=strings[int(text)] if c.get('t')=='s' else ''.join(t.text or '' for t in c.findall('s:is//s:t',NS)) if c.get('t')=='inlineStr' else text or ''
                    values[col-1]=value
                if values and any(v!='' for v in values.values()): rows.append([values.get(i,'') for i in range(max(values)+1)])
                if len(rows)>20001: raise ValueError('Use at most 20,000 rows.')
            return rows
        except (KeyError,StopIteration,AttributeError,IndexError,ET.ParseError,TypeError,OverflowError,BadZipFile) as error:
            raise ValueError('Invalid or unsupported .xlsx workbook.') from error


def archive_data(payload,kind):
    # Only used for files already on the server, never as authority for uploads.
    with open_book(payload) as z:
        if 'ceva/snapshot.json' in z.namelist():
            value=json.loads(z.read('ceva/snapshot.json'))
            if value.get('kind')!=kind: raise ValueError('Wrong backup category.')
            return value['data']
    return None
