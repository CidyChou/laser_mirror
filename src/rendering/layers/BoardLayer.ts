import { Container, Graphics } from 'pixi.js';
import type { BoardGeometry, LevelDefinition } from '@/gameplay/types';
import { Theme } from '../theme';

export class BoardLayer extends Container {
  rebuild(level:LevelDefinition,g:BoardGeometry){
    this.cacheAsTexture(false);
    this.removeChildren().forEach(c=>c.destroy());
    const depth=Math.max(14,g.cell*.12);
    const shape=new Graphics();

    // v6.2: a single shallow molded board, with only bottom/right extrusion.
    shape.roundRect(g.ox+4,g.oy+10,g.boardW,g.boardH,24).fill({color:0x02050a,alpha:.42});
    shape.moveTo(g.ox+18,g.oy+g.boardH)
      .lineTo(g.ox+g.boardW-18,g.oy+g.boardH)
      .lineTo(g.ox+g.boardW-5+depth,g.oy+g.boardH+depth)
      .lineTo(g.ox+12+depth,g.oy+g.boardH+depth)
      .fill(0x090e17);
    shape.moveTo(g.ox+g.boardW,g.oy+18)
      .lineTo(g.ox+g.boardW,g.oy+g.boardH-18)
      .lineTo(g.ox+g.boardW+depth,g.oy+g.boardH-4+depth)
      .lineTo(g.ox+g.boardW+depth,g.oy+12+depth)
      .fill(0x0d1522);

    shape.roundRect(g.ox,g.oy,g.boardW,g.boardH,24).fill(Theme.boardTop).stroke({color:0xffffff,width:2,alpha:.08});
    // bottom shade approximates the original Canvas vertical gradient.
    shape.roundRect(g.ox+2,g.oy+g.boardH*.43,g.boardW-4,g.boardH*.57-2,22).fill({color:Theme.boardBottom,alpha:.28});

    for(let y=0;y<level.rows;y++)for(let x=0;x<level.cols;x++){
      const inset=Math.max(4,g.cell*.055);
      const rx=g.ox+x*g.cell+inset, ry=g.oy+y*g.cell+inset, size=g.cell-inset*2;
      const color=(x+y)%2?Theme.cellB:Theme.cellA;
      const radius=Math.max(9,g.cell*.12);
      shape.roundRect(rx,ry+3,size,size,radius).fill({color:Theme.shadow,alpha:.16});
      shape.roundRect(rx,ry,size,size,radius).fill(color).stroke({color:0xffffff,width:1,alpha:.035});
      shape.roundRect(rx+1,ry+size*.48,size-2,size*.50-1,radius*.85).fill({color:0x0b1220,alpha:.12});
    }

    this.addChild(shape);
    this.cacheAsTexture({resolution:1.25,antialias:true});
  }
}
