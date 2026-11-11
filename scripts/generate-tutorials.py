"""Encode captured gameplay frames as looping GIFs. Requires ffmpeg.
First run scripts/record-tutorials.cjs against the game server.
"""
import os
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets/tutorials'
for kind in ['picking','conveyor','barcode','packing','detective','loading','memory','quality','final']:
    if os.environ.get('RECORD_GAMES') and kind not in os.environ['RECORD_GAMES'].split(','):
        continue
    frames=ROOT/'work/tutorial-recordings'/kind
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','8','-i',str(frames/'%04d.png'),'-filter_complex','[0:v]scale=800:450:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle','-loop','0',str(OUT/f'{kind}.gif')],check=True)
    print(kind,(OUT/f'{kind}.gif').stat().st_size,flush=True)
