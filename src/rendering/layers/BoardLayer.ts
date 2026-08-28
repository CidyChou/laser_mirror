import { Container, Graphics } from 'pixi.js';
import { GameConfig } from '@/config/GameConfig';
import type { BoardGeometry, LevelDefinition } from '@/gameplay/types';
import { Theme } from '../theme';

export class BoardLayer extends Container {
  rebuild(level:LevelDefinition,g:BoardGeometry){
    this.cacheAsTexture(false);
    this.removeChildren().forEach(c=>c.destroy());
    const depth=Math.max(10,g.cell*.09);
    const shape=new Graphics();

    // Shallow toy-board construction: one face, one restrained lower lip and
    // recessed cells. It keeps the 2.5D read without glossy overlay bands.
    shape.roundRect(g.ox+3,g.oy+10,g.boardW,g.boardH,24).fill({color:Theme.boardShadow,alpha:.34});
    shape.moveTo(g.ox+18,g.oy+g.boardH)
      .lineTo(g.ox+g.boardW-18,g.oy+g.boardH)
      .lineTo(g.ox+g.boardW-7+depth,g.oy+g.boardH+depth)
      .lineTo(g.ox+14+depth,g.oy+g.boardH+depth)
      .fill(Theme.boardDepthBottom);
    shape.moveTo(g.ox+g.boardW,g.oy+18)
      .lineTo(g.ox+g.boardW,g.oy+g.boardH-18)
      .lineTo(g.ox+g.boardW+depth,g.oy+g.boardH-6+depth)
      .lineTo(g.ox+g.boardW+depth,g.oy+14+depth)
      .fill(Theme.boardDepthSide);

    shape.roundRect(g.ox,g.oy,g.boardW,g.boardH,24)
      .fill(Theme.boardTop)
      .stroke({color:Theme.surfaceLine,width:2,alpha:.82});
    shape.roundRect(g.ox+4,g.oy+4,g.boardW-8,g.boardH-8,20)
      .stroke({color:Theme.white,width:1,alpha:.045});

    for(let y=0;y<level.rows;y++)for(let x=0;x<level.cols;x++){
      const inset=Math.max(4,g.cell*.055);
      const rx=g.ox+x*g.cell+inset, ry=g.oy+y*g.cell+inset, size=g.cell-inset*2;
      const color=(x+y)%2?Theme.cellB:Theme.cellA;
      const radius=Math.max(9,g.cell*.12);
      shape.roundRect(rx,ry+3,size,size,radius).fill({color:Theme.shadow,alpha:.2});
      shape.roundRect(rx,ry,size,size-3,radius)
        .fill(color)
        .stroke({color:Theme.surfaceLine,width:1.2,alpha:.7});
      shape.roundRect(rx+4,ry+4,size-8,size-11,radius*.72)
        .stroke({color:Theme.white,width:1,alpha:.035});
    }

    this.addChild(shape);
    this.cacheAsTexture({
      resolution:GameConfig.renderer.staticCacheResolution,
      antialias:true,
    });
  }
}
