"""Draw new structural guide diagrams from real simulator traces, not final artwork."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).parent / 'references'
for path in root.glob('level-*.json'):
    data = json.loads(path.read_text())
    level, g = data['level'], data['geometry']
    image = Image.new('RGB', (int(g['boardW'] + 280), int(g['boardH'] + 280)), '#081123')
    d = ImageDraw.Draw(image)
    ox, oy, c = g['ox'], g['oy'], g['cell']
    for y in range(level['rows']):
        for x in range(level['cols']):
            xx, yy = ox + x*c, oy + y*c
            d.rounded_rectangle((xx+4, yy+4, xx+c-4, yy+c-4), radius=10, fill='#29284d', outline='#424566', width=2)
    def center(x,y): return ox+(x+.5)*c, oy+(y+.5)*c
    def port(p):
        s,i=p['side'],p['index']
        return {'W':(ox,oy+(i+.5)*c),'E':(ox+g['boardW'],oy+(i+.5)*c),'N':(ox+(i+.5)*c,oy),'S':(ox+(i+.5)*c,oy+g['boardH'])}[s]
    for seg in data['trace']['segments']:
        xy=(seg['x1'],seg['y1'],seg['x2'],seg['y2'])
        d.line(xy,fill='#a12d75',width=16)
        d.line(xy,fill='#ff47b2',width=7)
        d.line(xy,fill='#fff3fb',width=2)
    for item in level['items']:
        x,y=center(item['x'],item['y'])
        if item['type']=='mirror':
            dy=26 if item['s']==0 else -26
            line=(x-26,y-dy,x+26,y+dy)
            d.line(line,fill='#dae9f0',width=18)
            d.line(line,fill='#59ddea',width=12)
        elif item['type']=='portal':
            d.ellipse((x-32,y-32,x+32,y+32),fill='#080c20',outline='#73e2eb',width=8)
            d.ellipse((x-23,y-23,x+23,y+23),outline='#8558e4',width=3)
    for p,color in [(level['emitter'],'#ff3c98')]+[(p,'#ffbd4c') for p in level['targets']]:
        x,y=port(p)
        if p['side'] in ('W','E'):box=(x-10,y-28,x+10,y+28)
        else:box=(x-28,y-10,x+28,y+10)
        d.rounded_rectangle(box, radius=5, fill='#c8d4e2', outline='#5c6d83',width=3)
        d.ellipse((x-5,y-5,x+5,y+5),fill=color)
    image.save(path.with_suffix('.png'))
