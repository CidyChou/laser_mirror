import { WeldingSparks } from './WeldingSparks';
import { Container, FillGradient, Graphics } from 'pixi.js';
import type { ImpactEvent, Point } from '@/gameplay/types';
import { isLightTheme, Theme } from '../theme';

type Fx={
  root:Container;
  ring:Graphics;
  flash:Graphics;
  rays:WeldingSparks;
  bloom:Graphics;
  start:number;
  life:number;
  active:boolean;
  strength:number;
  inward:boolean;
};

export class ImpactSystem extends Container{
  private pool:Fx[]=[];
  private readonly bloomFill=new FillGradient({type:'radial',center:{x:.5,y:.5},outerCenter:{x:.5,y:.5},innerRadius:0,outerRadius:.5,
    colorStops:[{offset:0,color:'rgba(255,255,255,.65)'},{offset:.25,color:'rgba(255,255,255,.32)'},
      {offset:.6,color:'rgba(255,255,255,.09)'},{offset:1,color:'rgba(255,255,255,0)'}],textureSize:128});

  constructor(){
    super();
    for(let i=0;i<24;i++){
      const root=new Container();root.visible=false;
      const ring=new Graphics().circle(0,0,6.5).stroke({color:Theme.white,width:2.1,alpha:.88});
      const flash=new Graphics().circle(0,0,4.5).fill({color:Theme.white,alpha:.92});
      const bloom=new Graphics().circle(0,0,44).fill(this.bloomFill);
      const rays=new WeldingSparks();
      const blend=isLightTheme()?'normal':'add';
      ring.blendMode=blend;flash.blendMode=blend;rays.blendMode=blend;bloom.blendMode=blend;
      root.addChild(bloom,ring,rays,flash);this.addChild(root);
      this.pool.push({root,ring,flash,rays,bloom,start:0,life:320,active:false,strength:1,inward:false});
    }
  }

  triggerLaunch(x:number,y:number,now:number){
    this.activate(x,y,Theme.beam,now,360,1.55);
  }

  triggerImpactEffect(e:ImpactEvent,now:number,colorOverride?:number){
    if(e.type==='combiner-fire'){this.activate(e.px,e.py,Theme.beam,now,460,2);return;}
    if(e.type==='portal'||e.type==='portal-exit'){
      // Portal feedback keeps its distinct circular language.
      this.activate(e.px,e.py,colorOverride??Theme.purple,now,e.type==='portal'?340:420,1.5,e.type==='portal',false);
      return;
    }
    const color=colorOverride??(e.type==='target'||e.type==='switch'||e.type==='focus'||e.type==='door-open'?Theme.green
      :e.type==='combiner'||e.type==='splitter'?Theme.cyan:e.type==='mirror'?Theme.white:Theme.beam);
    const strength=e.type==='target'||e.type==='focus'?1.65:e.type==='combiner'?1.38:e.type==='mirror'||e.type==='splitter'?1.24:1.08;
    this.activate(e.px,e.py,color,now,e.type==='target'||e.type==='focus'?520:340,strength);
  }

  triggerVictory(points:Point[],now:number){
    points.forEach((point,index)=>this.activate(point.x,point.y,Theme.green,now+index*45,680,1.9));
  }

  private activate(x:number,y:number,color:number,start:number,life:number,strength:number,inward=false,flare=true){
    const effect=this.pool.find(value=>!value.active)??this.pool[0];
    effect.active=true;effect.start=start;effect.life=life;effect.strength=strength;effect.inward=inward;
    effect.root.visible=true;effect.root.position.set(x,y);
    effect.ring.tint=color;effect.flash.tint=Theme.white;
    effect.rays.visible=flare;effect.rays.tint=color===Theme.white?Theme.beamHot:color;
    effect.bloom.visible=flare;effect.bloom.tint=color===Theme.white?Theme.beam:color;
    effect.rays.rotation=0;effect.rays.scale.set(strength);
    effect.rays.reset();
    effect.ring.scale.set(1);effect.flash.scale.set(1);
  }

  update(now:number){
    for(const effect of this.pool){
      if(!effect.active)continue;
      const t=(now-effect.start)/effect.life;
      if(t<0){effect.root.visible=false;continue;}
      if(t>=1){effect.active=false;effect.root.visible=false;continue;}
      effect.root.visible=true;
      const out=1-Math.pow(1-t,2.2);
      effect.ring.scale.set(effect.inward?.45+(1-out)*3.5:1+out*3.05*effect.strength);
      effect.ring.alpha=(1-t)*(effect.rays.visible?.38:.86);
      effect.rays.animate(now,effect.root.x*.17+effect.root.y*.31,12,now-effect.start);
      effect.rays.alpha=1;
      effect.bloom.scale.set((.6+out*.7)*effect.strength);
      effect.bloom.alpha=Math.pow(1-t,1.8)*.85;
      effect.flash.scale.set(.62+Math.sin(Math.min(1,t*4.5)*Math.PI)*1.08*effect.strength);
      effect.flash.alpha=Math.max(0,1-t*4)*.88;
    }
  }

  get active(){return this.pool.some(effect=>effect.active);}
  clear(){for(const effect of this.pool){effect.active=false;effect.root.visible=false;}}

  override destroy(options?:Parameters<Container['destroy']>[0]){
    super.destroy(options);this.bloomFill.destroy();
  }
}
