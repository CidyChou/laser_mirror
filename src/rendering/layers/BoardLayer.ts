import { Container, FillGradient, Graphics } from 'pixi.js';
import { GameConfig } from '@/config/GameConfig';
import type { BoardGeometry, LevelDefinition } from '@/gameplay/types';
import { isLightTheme, Theme } from '../theme';

/** A machined deck with narrow joints and a luminous lower chassis. */
export class BoardLayer extends Container {
  private readonly cellFills=[Theme.cellA,Theme.cellB].map(color=>new FillGradient({
    start:{x:0,y:0},end:{x:0,y:1},textureSize:64,
    colorStops:[{offset:0,color},{offset:1,color:shade(color,isLightTheme()?.90:.72)}],
  }));
  rebuild(level:LevelDefinition,g:BoardGeometry){
    this.cacheAsTexture(false);
    this.removeChildren().forEach(c=>c.destroy());
    const depth=Math.max(9,g.cell*.075),shape=new Graphics();
    const {ox:x,oy:y,boardW:w,boardH:h}=g;
    shape.roundRect(x-5,y+12,w+16,h+depth,16).fill({color:Theme.boardShadow,alpha:.6});
    shape.roundRect(x-4,y+depth,w+8,h,14).fill(Theme.boardDepthSide)
      .stroke({color:Theme.cyan,width:1.5,alpha:.32});
    shape.moveTo(x+22,y+h+depth).lineTo(x+w*.32,y+h+depth)
      .moveTo(x+w*.68,y+h+depth).lineTo(x+w-22,y+h+depth)
      .stroke({color:Theme.cyan,width:3,alpha:.75});
    shape.roundRect(x-4,y-4,w+8,h+8,14).fill(Theme.cellShade)
      .stroke({color:Theme.surfaceLine,width:2,alpha:.9});
    for(let row=0;row<level.rows;row++)for(let col=0;col<level.cols;col++){
      const inset=Math.max(1.5,g.cell*.018),size=g.cell-inset*2;
      const rx=x+col*g.cell+inset,ry=y+row*g.cell+inset,radius=Math.max(4,g.cell*.045);
      shape.roundRect(rx,ry+3,size,size-3,radius).fill(Theme.boardShadow);
      shape.roundRect(rx,ry,size,size-3,radius).fill(this.cellFills[(col+row)%2])
        .stroke({color:Theme.cyanSoft,width:.8,alpha:.10});
      shape.moveTo(rx+radius,ry+1).lineTo(rx+size-radius,ry+1)
        .stroke({color:Theme.cyanSoft,width:1,alpha:.13});
      // A quiet registration cross keeps empty cells intentional and readable.
      const cx=rx+size/2,cy=ry+size/2;
      shape.moveTo(cx-3,cy).lineTo(cx+3,cy).moveTo(cx,cy-3).lineTo(cx,cy+3)
        .stroke({color:Theme.cyanSoft,width:1,alpha:.09});
    }
    for(const [cx,cy,sx,sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){
      shape.moveTo(cx,cy+sy*17).lineTo(cx,cy).lineTo(cx+sx*17,cy)
        .stroke({color:Theme.cyanSoft,width:2.5,alpha:.8});
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
