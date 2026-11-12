"""Persistent Excel backups, written before deletion and once per local calendar day."""
from datetime import datetime
from io import BytesIO
import json
import logging
import os
from pathlib import Path
import sqlite3
import tempfile
from threading import Event, RLock, Thread
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def workbook(rows):
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    def text(value):
        return escape(''.join(c for c in str(value or '') if ord(c) >= 32 or c in '\t\n\r'))
    ordered = sorted(rows, key=lambda r: (-r.get('score', 0), -r.get('accuracy', 0), r.get('mistakes', 0), str(r.get('timestamp', '')), str(r.get('id', ''))))
    data = [['Name', 'Email', 'Points']] + [[r.get('name', ''), r.get('email', ''), r.get('score', 0)] for r in ordered]
    sheet = []
    for index, row in enumerate(data, 1):
        cells = []
        for col, value in enumerate(row):
            ref = f'{"ABC"[col]}{index}'
            style = 1 if index == 1 else 2 if index % 2 else 0
            if index > 1 and col == 2:
                cells.append(f'<c r="{ref}" s="{style}"><v>{value or 0}</v></c>')
            else:
                cells.append(f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{text(value)}</t></is></c>')
        sheet.append(f'<row r="{index}" ht="28" customHeight="1">{"".join(cells)}</row>')
    files = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Results" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': f'<worksheet xmlns="{ns}"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="34" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/></cols><sheetData>{"".join(sheet)}</sheetData><autoFilter ref="A1:C{len(data)}"/></worksheet>',
        'xl/styles.xml': f'<styleSheet xmlns="{ns}"><fonts count="2"><font><sz val="12"/><name val="Calibri"/><color rgb="FF142C44"/></font><font><b/><sz val="12"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF102C46"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F5FA"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom style="thin"><color rgb="FFDCE5EF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    }
    output = BytesIO()
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for path, xml in files.items():
            archive.writestr(path, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + xml)
    return output.getvalue()


class BackupManager:
    def __init__(self, db_path, directory, timezone='Europe/Berlin'):
        self.db_path = db_path
        self.directory = Path(directory).resolve()
        self.directory.mkdir(parents=True, exist_ok=True)
        try:
            self.zone = ZoneInfo(timezone)
        except ZoneInfoNotFoundError:
            self.zone = None  # Windows without IANA data: use the system local timezone.
            logging.warning('Backup timezone data unavailable; using system local time')
        self.lock = RLock()
        self.stopped = Event()

    def create(self, rows, daily=False, now=None):
        now = now or datetime.now(self.zone)
        date = now.astimezone(self.zone).strftime('%d.%m.%Y')
        stem = f'Leaderboard BackUp - {date}' if daily else f'Leaderboard - {date}'
        with self.lock:
            target = self.directory / f'{stem}.xlsx'
            if daily and target.exists():
                return target.name
            payload = workbook(rows)
            # Publish only a fully written workbook; a crash cannot leave a partial .xlsx.
            fd, temporary_name = tempfile.mkstemp(prefix='.leaderboard-', suffix='.tmp', dir=self.directory)
            temporary = Path(temporary_name)
            try:
                with os.fdopen(fd, 'wb') as file:
                    file.write(payload)
                    file.flush()
                    os.fsync(file.fileno())
                counter = 1
                while True:
                    try:
                        os.link(temporary, target)  # Atomic, and never overwrites another backup.
                        return target.name
                    except FileExistsError:
                        if daily:
                            return target.name
                        counter += 1
                        target = self.directory / f'{stem} ({counter}).xlsx'
            finally:
                temporary.unlink(missing_ok=True)

    def daily(self, now=None):
        now = now or datetime.now(self.zone)
        name = f'Leaderboard BackUp - {now.astimezone(self.zone).strftime("%d.%m.%Y")}.xlsx'
        with self.lock:
            if (self.directory / name).exists():
                return name
            with sqlite3.connect(self.db_path, timeout=10) as db:
                rows = [json.loads(row[0]) for row in db.execute('SELECT payload FROM runs')]
            return self.create(rows, daily=True, now=now)

    def start(self):
        def run():
            while not self.stopped.is_set():
                try:
                    self.daily()  # Catch up at startup, then the first check after midnight.
                except (OSError, sqlite3.Error):
                    logging.exception('Daily leaderboard backup failed; will retry')
                self.stopped.wait(15)
        Thread(target=run, name='leaderboard-midnight-backups', daemon=True).start()
