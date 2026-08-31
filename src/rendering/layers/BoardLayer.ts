import { Container, FillGradient, Graphics } from 'pixi.js';
import { GameConfig } from '@/config/GameConfig';
import type { BoardGeometry, LevelDefinition } from '@/gameplay/types';
import { Theme } from '../theme';

export class BoardLayer extends Container {
  private readonly cellFills=[Theme.cellA,Theme.cellB].map(color=>new FillGradient({
    start:{x:0,y:0},end:{x:0,y:1},textureSize:64,
    colorStops:[{offset:0,color},{offset:1,color:shade(color,.88)}],
  }));
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
      .fill(Theme.cellShade)
      .stroke({color:Theme.surfaceLine,width:1.5,alpha:.58});

    for(let y=0;y<level.rows;y++)for(let x=0;x<level.cols;x++){
      const inset=Math.max(4,g.cell*.055);
      const rx=g.ox+x*g.cell+inset, ry=g.oy+y*g.cell+inset, size=g.cell-inset*2;
      const fill=this.cellFills[(x+y)%2];
      const radius=Math.max(9,g.cell*.12);
      shape.roundRect(rx,ry+3,size,size,radius).fill({color:Theme.shadow,alpha:.2});
      // One uninterrupted face, separated by dark channels. No inset outline.
      shape.roundRect(rx,ry,size,size-2,radius).fill(fill);
    }

    this.addChild(shape);
    this.cacheAsTexture({
      resolution:GameConfig.renderer.staticCacheResolution,
      antialias:true,
    });
  }
  override destroy(options?:Parameters<Container['destroy']>[0]){
    super.destroy(options);this.cellFills.forEach(fill=>fill.destroy());
  }
}

function shade(color:number,amount:number){
  return (Math.round(((color>>16)&255)*amount)<<16)|(Math.round(((color>>8)&255)*amount)<<8)|Math.round((color&255)*amount);
}
