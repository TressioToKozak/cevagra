"""Generate small looping instructional GIF diagrams; no actual challenge answers."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets/tutorials'
OUT.mkdir(exist_ok=True)
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
navy='#071c2d'; line='#38576d'; white='#ecf3fa'; muted='#9fc0d4'; gold='#f6ce77'; green='#72e1b3'; red='#ff4b65'
def font(size,bold=False):return ImageFont.truetype(BOLD if bold else FONT,size)
def label(d,pos,text,color=white,size=18,bold=False):d.text(pos,text,font=font(size,bold),fill=color)
def box(d,rect,text='',color=line,fill='#102c42',size=18):
 d.rounded_rectangle(rect,8,fill=fill,outline=color,width=2)
 if text:
  x1,y1,x2,y2=rect;b=d.textbbox((0,0),text,font=font(size,True));label(d,((x1+x2-b[2])/2,(y1+y2-b[3])/2-2),text,white,size,True)
def cursor(d,x,y,click=False):
 if click:d.ellipse((x-17,y-17,x+17,y+17),outline=gold,width=3)
 d.polygon([(x,y),(x+2,y+24),(x+9,y+17),(x+16,y+27),(x+22,y+23),(x+15,y+13),(x+25,y+11)],fill=white,outline=navy)
def scene(kind,frame):
 im=Image.new('RGB',(640,360),navy);d=ImageDraw.Draw(im)
 t=frame/39;phase=min(3,frame//10);active=phase>=2
 names={'picking':'SPEED PICKING','barcode':'BARCODE HUNT','detective':'WMS DETECTIVE','conveyor':'CONVEYOR RUSH','packing':'PACKING TETRIS','loading':'TRUCK LOADING','memory':'MEMORY CHALLENGE','quality':'QUALITY CONTROL','final':'FINAL DISPATCH'}
 label(d,(26,18),names[kind],gold,18,True)
 caption=''
 if kind in ['picking','barcode']:
  box(d,(26,57,614,103),'FIND SKU: 4821',gold)
  choices=['4812','4821','8421','4281','8241','4128']
  for i,text in enumerate(choices):
   x=30+i%3*205;y=125+i//3*75
   box(d,(x,y,x+185,y+58),text,green if active and i==1 else line,fill='#173f3e' if active and i==1 else '#102c42')
  cursor(d,180+150*min(1,t*2),260-99*min(1,t*2),active)
  caption='Compare the SKU, then click the matching '+('location.' if kind=='picking' else 'box.')
 elif kind=='detective':
  label(d,(83,61),'WMS SKU',muted,15,True);label(d,(303,61),'SCANNER SKU',muted,15,True)
  for i,(a,b) in enumerate([('4821','4821'),('7312','7132'),('9054','9054')]):
   y=91+i*52;box(d,(30,y,610,y+44),'',green if active and i==1 else line)
   label(d,(85,y+10),a,size=19);label(d,(315,y+10),b,size=19)
   box(d,(47,y+12,66,y+31),'',gold if active and i==1 else line)
   if active and i==1:label(d,(49,y+8),'✓',green,19)
  box(d,(382,257,610,298),'CONFIRM',gold if phase==3 else line)
  cursor(d,61 if phase<3 else 490,160 if phase<3 else 272,active)
  caption='Select the differing rows. Then click CONFIRM.'
 elif kind in ['conveyor','packing','loading']:
  if kind=='conveyor':
   box(d,(25,65,615,155),'',line);label(d,(40,78),'CONVEYOR',muted,13)
   for i,text in enumerate(['DHL','UPS','DPD']):box(d,(28+i*205,215,205+i*205,280),text,green if active and i==1 else line)
   start=(110,115);end=(320,245);text='UPS';caption='Drag each box to its matching carrier.'
  elif kind=='packing':
   label(d,(35,65),'BOXES',muted,14);label(d,(304,65),'PALLET',muted,14)
   for x in range(5):
    for y in range(3):box(d,(288+x*56,91+y*56,342+x*56,145+y*56),'',line,fill='#17312d')
   box(d,(42,201,145,253),'BOX',line);start=(104,125);end=(343,146);text='BOX';caption='Drag a box into free pallet space. Avoid overlaps.'
  else:
   label(d,(30,65),'DELIVERY ORDER',muted,14)
   for i in range(3):box(d,(30,98+i*57,162,144+i*57),f'STOP {i+1}',line,size=16)
   box(d,(260,82,606,282),'',line);label(d,(272,91),'DEEPEST',muted,12);label(d,(515,91),'DOOR',muted,12)
   for i,text2 in enumerate(['STOP 3','STOP 2','STOP 1']):box(d,(272+i*108,135,370+i*108,255),text2,green if active and i==0 else line,size=15)
   start=(97,235);end=(321,190);text='STOP 3';caption='Load the last delivery deepest. First delivery by the door.'
  ratio=max(0,min(1,(t-.2)/.45));x=start[0]+(end[0]-start[0])*ratio;y=start[1]+(end[1]-start[1])*ratio
  box(d,(x-46,y-24,x+46,y+24),text,green if active else gold,fill='#6a4d2a',size=15);cursor(d,x+15,y+12,phase==3)
 elif kind=='memory':
  original=phase<2;label(d,(28,59),'REMEMBER THESE GIFTS' if original else 'SELECT THE SAME GIFTS',muted,17,True)
  options=['A','B','C','D','E'] if original else ['A','X','C','E','B','Y','D','Z']
  for i,text in enumerate(options):
   x=35+(i%4)*150;y=103+(i//4)*79;selected=not original and phase==3 and text in 'ABCDE'
   box(d,(x,y,x+120,y+61),text,green if selected else line,fill='#264138' if selected else '#102c42',size=26)
  if not original:cursor(d,92,132,phase==3)
  caption='Remember five gifts, then select them among the decoys.'
 elif kind=='quality':
  for i,text in enumerate(['GOOD','DAMAGED','BAD LABEL']):
   x=28+i*205;box(d,(x,90,x+180,245),'',red if active and i in [1,2] else line,fill='#654a31')
   label(d,(x+14,106),'PARCEL',gold,14,True)
   if i==1:d.line([(x+40,144),(x+66,175),(x+51,190),(x+98,223)],fill=red,width=5)
   else:box(d,(x+25,153,x+154,206),'SKU 4821' if i==0 else '???',red if i==2 else white,size=16)
  cursor(d,300,176,active);caption='Select every parcel with damage or incorrect labels.'
 else:
  label(d,(48,65),'ORDER',muted,17,True);label(d,(343,65),'PACKED',muted,17,True)
  for i,(a,b) in enumerate([('SKU 4821','SKU 4821'),('QTY 12','QTY 10')]):
   y=108+i*59;box(d,(28,y,296,y+46),a,line);box(d,(326,y,612,y+46),b,red if active and i==1 else line)
  box(d,(35,245,300,292),'RELEASE',line);box(d,(335,245,605,292),'HOLD',gold if phase==3 else line)
  cursor(d,475,189 if phase<3 else 268,active);caption='Flag mismatches, then HOLD. All correct? RELEASE.'
 d.rectangle((0,315,640,360),fill='#102c42');label(d,(20,330),caption,white,14)
 return im
for kind in ['picking','conveyor','barcode','packing','detective','loading','memory','quality','final']:
 frames=[scene(kind,i) for i in range(40)]
 # Shared palette prevents flicker between GIF frames.
 palette_source=Image.new('RGB',(640,1440))
 for index,frame in enumerate([frames[0],frames[15],frames[25],frames[35]]):palette_source.paste(frame,(0,index*360))
 palette=palette_source.quantize(colors=96)
 frames=[f.quantize(palette=palette) for f in frames]
 frames[0].save(OUT/f'{kind}.gif',save_all=True,append_images=frames[1:],duration=100,loop=0,optimize=False,disposal=2)
 print(kind,(OUT/f'{kind}.gif').stat().st_size)
