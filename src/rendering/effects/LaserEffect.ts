import { BlurFilter, Container, Graphics } from 'pixi.js';
import { GameConfig } from '@/config/GameConfig';
import type { GameState, LaserSegment } from '@/gameplay/types';
import type { Quality } from '@/performance/PerformanceManager';
import { Theme } from '../theme';

type VisibleSegment={src:LaserSegment;x1:number;y1:number;x2:number;y2:number;t:number};

export class LaserEffect extends Container{
  private wideGlow=new Graphics();
  private innerGlow=new Graphics();
  private body=new Graphics();
  private plasma=new Graphics();
  private core=new Graphics();
  private packets=new Graphics();
  private head=new Graphics();
  private charge=new Graphics();
  private resultRef:any=null;
  private animating=false;
  private wideBlur=new BlurFilter({strength:11,quality:1});
  private innerBlur=new BlurFilter({strength:4,quality:1});

  constructor(){
    super();
    this.wideGlow.blendMode='add';this.innerGlow.blendMode='add';this.body.blendMode='add';this.plasma.blendMode='add';this.core.blendMode='add';this.packets.blendMode='add';this.head.blendMode='add';this.charge.blendMode='add';
    this.wideGlow.filters=[this.wideBlur];this.innerGlow.filters=[this.innerBlur];
    this.addChild(this.wideGlow,this.innerGlow,this.body,this.plasma,this.core,this.packets,this.head,this.charge);
  }
  bind(state:GameState){this.resultRef=state.result;}
  private visibleSegment(seg:LaserSegment,dist:number):VisibleSegment|null{if(dist<=seg.startDist)return null;const span=Math.max(.001,seg.endDist-seg.startDist),t=Math.min(1,(dist-seg.startDist)/span);return{src:seg,x1:seg.x1,y1:seg.y1,x2:seg.x1+(seg.x2-seg.x1)*t,y2:seg.y1+(seg.y2-seg.y1)*t,t};}

  update(state:GameState,now:number,quality:Quality){
    this.bind(state);this.animating=state.firing;
    this.wideGlow.clear();this.innerGlow.clear();this.body.clear();this.plasma.clear();this.core.clear();this.packets.clear();this.head.clear();this.charge.clear();
    const result=state.result;if(!result)return;

    if(state.firing){
      const chargeT=Math.min(1,(now-state.shotStart)/GameConfig.laser.chargeMs);
      if(chargeT<1){
        const p=result.segments[0];if(p){const x=p.x1,y=p.y1;for(let i=0;i<3;i++){const phase=(chargeT+i*.23)%1,r=30-phase*21;this.charge.circle(x,y,r).stroke({color:Theme.beam,width:1.4+phase*1.6,alpha:(.18+phase*.34)*(1-chargeT*.15)});}for(let i=0;i<4;i++){const a=chargeT*Math.PI*5+i*Math.PI*.5,r=17*(1-chargeT*.55);this.charge.circle(x+Math.cos(a)*r,y+Math.sin(a)*r,1.7+chargeT*.8).fill({color:i%2?0xffffff:Theme.beam,alpha:.45+chargeT*.45});}const throb=.78+.22*Math.sin(chargeT*Math.PI*10);this.charge.circle(x,y,(3.2+chargeT*4.8)*throb).fill({color:0xffffff,alpha:.72+chargeT*.28});}
      }
    }

    const dist=state.beamDistance;if(dist<=0)return;const visible:VisibleSegment[]=[];for(const s of result.segments){const v=this.visibleSegment(s,dist);if(v)visible.push(v);}if(!visible.length)return;
    const breathe=.5+.5*Math.sin(now*.0042),micro=.5+.5*Math.sin(now*.0105);
    const wide=quality==='low'?23:28;const inner=quality==='low'?14:17;

    for(const s of visible){
      // Atmospheric red bloom: blurred, transparent, and red-dominant like v6.2 shadowBlur.
      this.wideGlow.moveTo(s.x1,s.y1).lineTo(s.x2,s.y2).stroke({color:Theme.beam2,width:wide+breathe*2,alpha:.28+breathe*.06});
      this.innerGlow.moveTo(s.x1,s.y1).lineTo(s.x2,s.y2).stroke({color:Theme.beam2,width:inner+breathe*1.2,alpha:.42+breathe*.08});
      this.body.moveTo(s.x1,s.y1).lineTo(s.x2,s.y2).stroke({color:Theme.beam,width:10.2+breathe*.8,alpha:.80+micro*.08});
      this.plasma.moveTo(s.x1,s.y1).lineTo(s.x2,s.y2).stroke({color:0xffcdd9,width:5.4,alpha:.93});
      this.core.moveTo(s.x1,s.y1).lineTo(s.x2,s.y2).stroke({color:0xfffdfd,width:2.45,alpha:.98});
      // round caps and turn fillers; this removes the hard 90-degree seams.
      for(const [x,y] of [[s.x1,s.y1],[s.x2,s.y2]] as const){this.body.circle(x,y,5.1).fill({color:Theme.beam,alpha:.76});this.plasma.circle(x,y,2.7).fill({color:0xffcdd9,alpha:.92});this.core.circle(x,y,1.25).fill({color:0xffffff,alpha:.98});}
    }

    // Small travelling packets from v6.2, not a field of particles.
    if(state.firing){visible.forEach((s,i)=>{const dx=s.x2-s.x1,dy=s.y2-s.y1,len=Math.hypot(dx,dy);if(len<8)return;const count=quality==='high'?2:1;for(let k=0;k<count;k++){const tt=(now*.00031+i*.137+k*.48)%1,x=s.x1+dx*tt,y=s.y1+dy*tt;this.packets.circle(x,y,k===0?2.7:1.7).fill({color:k===0?0xffffff:0xff9db4,alpha:k===0?.80:.52});}});}

    const partial=visible.find(s=>s.t<1);if(state.firing&&partial){const hp=.5+.5*Math.sin(now*.022);this.head.circle(partial.x2,partial.y2,10+hp*2).fill({color:Theme.beam2,alpha:.22});this.head.circle(partial.x2,partial.y2,5+hp).fill({color:0xffffff,alpha:.96});}
  }
  get active(){return this.animating;}
}
