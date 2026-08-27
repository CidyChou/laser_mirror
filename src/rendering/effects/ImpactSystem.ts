import { Container, Graphics } from 'pixi.js';
import type { ImpactEvent, Point } from '@/gameplay/types';
import { Theme } from '../theme';

type Fx={root:Container;ring:Graphics;cross:Graphics;flash:Graphics;start:number;life:number;active:boolean;color:number;strength:number};
export class ImpactSystem extends Container{
  private pool:Fx[]=[];
  constructor(){
    super();
    for(let i=0;i<24;i++){
      const root=new Container();root.visible=false;
      const ring=new Graphics().circle(0,0,7).stroke({color:0xffffff,width:3.6,alpha:.88});
      const flash=new Graphics().circle(0,0,7).fill({color:0xffffff,alpha:.9});
      const cross=new Graphics().moveTo(-14,0).lineTo(14,0).stroke({color:0xffffff,width:1.4,alpha:.5}).moveTo(0,-14).lineTo(0,14).stroke({color:0xffffff,width:1.4,alpha:.5});
      ring.blendMode='add';cross.blendMode='add';flash.blendMode='add';
      root.addChild(flash,ring,cross);
      this.addChild(root);
      this.pool.push({root,ring,cross,flash,start:0,life:320,active:false,color:0xffffff,strength:1});
    }
  }
  triggerLaunch(x:number,y:number,now:number){this.activate(x,y,0xffffff,now,240,1.05,false);this.activate(x,y,Theme.beam,now,480,2.05,false);}
  triggerImpactEffect(e:ImpactEvent,now:number){const col=e.type==='target'||e.type==='switch'?Theme.green:e.type==='portal'?Theme.purple:e.type==='splitter'?Theme.cyan:e.type==='mirror'?0xffffff:Theme.beam;const strength=e.type==='target'?1.65:e.type==='portal'?1.4:e.type==='mirror'||e.type==='splitter'?1.28:1.12;this.activate(e.px,e.py,col,now,e.type==='target'?560:e.type==='portal'?460:360,strength,e.type==='mirror'||e.type==='splitter');if(e.type==='portal'&&e.toX!==undefined&&e.toY!==undefined)this.activate(e.toX,e.toY,col,now+50,460,1.28,false);}
  triggerVictory(points:Point[],now:number){points.forEach((p,i)=>this.activate(p.x,p.y,Theme.green,now+i*45,720,2,false));}
  private activate(x:number,y:number,color:number,start:number,life:number,strength:number,cross:boolean){
    const f=this.pool.find(v=>!v.active)??this.pool[0];
    f.active=true;f.start=start;f.life=life;f.color=color;f.strength=strength;
    f.root.visible=true;f.root.position.set(x,y);
    f.ring.tint=color;f.flash.tint=0xffffff;f.cross.visible=cross;
  }
  update(now:number){for(const f of this.pool){if(!f.active)continue;const t=(now-f.start)/f.life;if(t<0){f.root.visible=false;continue;}if(t>=1){f.active=false;f.root.visible=false;continue;}f.root.visible=true;const out=1-Math.pow(1-t,2.15);f.ring.scale.set(1+out*3.15*f.strength);f.ring.alpha=(1-t)*.88;f.flash.scale.set(.65+Math.sin(Math.min(1,t*4)*Math.PI)*1.2*f.strength);f.flash.alpha=Math.max(0,1-t*3.5)*.9;f.cross.scale.set(.8+out*.9);f.cross.alpha=f.cross.visible?(1-t)*.48:0;}}
  get active(){return this.pool.some(f=>f.active);}
}
