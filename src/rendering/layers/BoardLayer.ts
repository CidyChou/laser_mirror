import { Container, FillGradient, Graphics } from 'pixi.js';
import { GameConfig } from '@/config/GameConfig';
import type { BoardGeometry, LevelDefinition } from '@/gameplay/types';
import { isLightTheme, Theme } from '../theme';

/** A quiet, uniform grid inside a single thin frame. */
export class BoardLayer extends Container {
  private readonly cellFills=[Theme.cellA,Theme.cellB].map(color=>new FillGradient({
    start:{x:0,y:0},end:{x:0,y:1},textureSize:64,
    colorStops:[{offset:0,color},{offset:1,color:shade(color,isLightTheme()?.96:.82)}],
  }));
  rebuild(level:LevelDefinition,g:BoardGeometry){
    this.cacheAsTexture(false);
    this.removeChildren().forEach(c=>c.destroy());
    const shape=new Graphics();
    const {ox:x,oy:y,boardW:w,boardH:h}=g;
    shape.roundRect(x-10,y-6,w+20,h+20,17).fill({color:Theme.boardShadow,alpha:.24});
    shape.roundRect(x-10,y-10,w+20,h+20,17).fill({color:Theme.cellShade,alpha:.64})
      .stroke({color:Theme.cyan,width:1.7,alpha:.46});
    for(let row=0;row<level.rows;row++)for(let col=0;col<level.cols;col++){
      const inset=Math.max(2,g.cell*.028),size=g.cell-inset*2;
      const rx=x+col*g.cell+inset,ry=y+row*g.cell+inset,radius=Math.max(6,g.cell*.095);
      shape.roundRect(rx,ry+1.5,size,size,radius).fill({color:Theme.boardShadow,alpha:.5});
      shape.roundRect(rx,ry,size,size,radius).fill(this.cellFills[0])
        .stroke({color:Theme.surfaceLine,width:1,alpha:.64});
      // A quiet registration cross keeps empty cells intentional and readable.
      const cx=rx+size/2,cy=ry+size/2;
      shape.moveTo(cx-3,cy).lineTo(cx+3,cy).moveTo(cx,cy-3).lineTo(cx,cy+3)
        .stroke({color:Theme.cyanSoft,width:.8,alpha:.10});
    }
    for(const [cx,cy,sx,sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){
      shape.moveTo(cx+sx*3,cy+sy*15).lineTo(cx+sx*3,cy+sy*9)
        .quadraticCurveTo(cx+sx*3,cy+sy*3,cx+sx*9,cy+sy*3).lineTo(cx+sx*15,cy+sy*3)
        .stroke({color:Theme.cyanSoft,width:1.8,alpha:.94});
    }
    this.addChild(shape);
    this.cacheAsTexture({resolution:GameConfig.renderer.staticCacheResolution,antialias:true});
  }
  override destroy(options?:Parameters<Container['destroy']>[0]){
    super.destroy(options);this.cellFills.forEach(fill=>fill.destroy());
  }
}
function shade(color:number,amount:number){
  return (Math.round(((color>>16)&255)*amount)<<16)|(Math.round(((color>>8)&255)*amount)<<8)|Math.round((color&255)*amount);
}
