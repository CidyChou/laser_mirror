import { BlurFilter, Container, Graphics } from 'pixi.js';
import { GameConfig } from '@/config/GameConfig';
import type { GameState, LaserSegment } from '@/gameplay/types';
import type { Quality } from '@/performance/PerformanceManager';
import { Theme } from '../theme';

type VisibleSegment={src:LaserSegment;x1:number;y1:number;x2:number;y2:number;t:number};
type Run={x1:number;y1:number;x2:number;y2:number};

export class LaserEffect extends Container{
  private wideGlow=new Graphics();
  private body=new Graphics();
  private plasma=new Graphics();
  private core=new Graphics();
  private packets=new Graphics();
  private head=new Graphics();
  private charge=new Graphics();
  private resultRef:any=null;
  private animating=false;
  private wideBlur=new BlurFilter({strength:14,quality:2});

  constructor(){
    super();
    this.wideGlow.blendMode='add';this.body.blendMode='add';this.plasma.blendMode='add';this.core.blendMode='add';this.packets.blendMode='add';this.head.blendMode='add';this.charge.blendMode='add';
    this.wideGlow.filters=[this.wideBlur];
    this.addChild(this.wideGlow,this.body,this.plasma,this.core,this.packets,this.head,this.charge);
  }
  bind(state:GameState){this.resultRef=state.result;}
  private visibleSegment(seg:LaserSegment,dist:number):VisibleSegment|null{if(dist<=seg.startDist)return null;const span=Math.max(.001,seg.endDist-seg.startDist),t=Math.min(1,(dist-seg.startDist)/span);return{src:seg,x1:seg.x1,y1:seg.y1,x2:seg.x1+(seg.x2-seg.x1)*t,y2:seg.y1+(seg.y2-seg.y1)*t,t};}
  private originDir(seg:LaserSegment){const dx=seg.x2-seg.x1,dy=seg.y2-seg.y1,len=Math.hypot(dx,dy)||1;return{dx:dx/len,dy:dy/len};}
  private axisOf(x1:number,y1:number,x2:number,y2:number){return Math.abs(x2-x1)>=Math.abs(y2-y1)?'h':'v';}
  private mergeCollinear(visible:VisibleSegment[]){
    const runs:Run[]=[];
    for(const s of visible){
      const last=runs[runs.length-1];
      const connected=last&&Math.hypot(s.x1-last.x2,s.y1-last.y2)<1.6;
      if(connected&&this.axisOf(last.x1,last.y1,last.x2,last.y2)===this.axisOf(s.x1,s.y1,s.x2,s.y2)){
        last.x2=s.x2;last.y2=s.y2;
      }else{
        runs.push({x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2});
      }
    }
    return runs;
  }
  private stroke(g:Graphics,r:Run,color:number,width:number,alpha:number){
    g.moveTo(r.x1,r.y1).lineTo(r.x2,r.y2).stroke({color,width,alpha,cap:'round',join:'round'});
  }

  update(state:GameState,now:number,quality:Quality){
    this.bind(state);this.animating=state.firing;
    this.wideGlow.clear();this.body.clear();this.plasma.clear();this.core.clear();this.packets.clear();this.head.clear();this.charge.clear();
    const result=state.result;if(!result)return;
    const chargeT=state.firing?Math.min(1,(now-state.shotStart)/GameConfig.laser.chargeMs):1;
    const launchAge=state.firing?Math.max(0,now-state.shotStart-GameConfig.laser.chargeMs):0;
    const origin=result.segments[0];

    if(state.firing&&chargeT<1&&origin){
      const dir=this.originDir(origin);
      const x=origin.x1+dir.dx*18,y=origin.y1+dir.dy*18;
      const inhale=chargeT*chargeT;
      this.charge.circle(x,y,26*(1-inhale*.55)).fill({color:Theme.beam2,alpha:.12*(1-chargeT*.25)});
      for(let i=0;i<2;i++){
        const phase=(chargeT*1.35+i*.42)%1,r=26-phase*18;
        this.charge.circle(x,y,r).stroke({color:i?Theme.beamHot:Theme.beam,width:2+phase*2.4,alpha:(.32+phase*.4)*(1-chargeT*.08)});
      }
      for(let i=0;i<7;i++){
        const a=chargeT*Math.PI*8+i*Math.PI*2/7,r=18*(1-Math.pow(chargeT,.85));
        this.charge.circle(x+Math.cos(a)*r,y+Math.sin(a)*r,1.8+chargeT*1.1).fill({color:i%2?0xffffff:Theme.beamHot,alpha:.55+chargeT*.4});
      }
      if(chargeT>.28){
        const stub=10+chargeT*28;
        this.charge.moveTo(x,y).lineTo(x+dir.dx*stub,y+dir.dy*stub).stroke({color:0xffffff,width:1.8+chargeT*4.2,alpha:.28+chargeT*.5,cap:'round'});
        this.charge.moveTo(x,y).lineTo(x+dir.dx*stub,y+dir.dy*stub).stroke({color:Theme.beam,width:6+chargeT*5,alpha:.18+chargeT*.22,cap:'round'});
      }
      const throb=.72+.28*Math.sin(chargeT*Math.PI*12);
      this.charge.circle(x,y,(4.2+chargeT*7.4)*throb).fill({color:0xffffff,alpha:.78+chargeT*.22});
      if(chargeT>.76){
        const pop=(chargeT-.76)/.24;
        this.charge.circle(x,y,8+pop*18).fill({color:0xffffff,alpha:.28*(1-pop)});
      }
    }

    const dist=state.beamDistance;if(dist<=0)return;
    const visible:VisibleSegment[]=[];for(const s of result.segments){const v=this.visibleSegment(s,dist);if(v)visible.push(v);}if(!visible.length)return;

    const breathe=.5+.5*Math.sin(now*.0042),micro=.5+.5*Math.sin(now*.0105);
    const launchBoost=state.firing?Math.max(0,1-launchAge/180):0;
    const punch=launchBoost*launchBoost;
    const wide=(quality==='low'?30:38)+punch*8;
    const runs=this.mergeCollinear(visible);

    for(const r of runs){
      this.stroke(this.wideGlow,r,Theme.beam2,wide+breathe*2,.22+breathe*.04+punch*.08);
      this.stroke(this.body,r,Theme.beam,12.2+breathe*.6+punch*2.4,.86+micro*.06);
      this.stroke(this.plasma,r,0xffcdd9,5.8+punch*1.2,.94);
      this.stroke(this.core,r,0xfffdfd,2.5+punch*.4,.98);
    }

    const joints:Array<[number,number]>=[];
    const seen=new Set<string>();
    const addJoint=(x:number,y:number)=>{const k=`${Math.round(x)},${Math.round(y)}`;if(seen.has(k))return;seen.add(k);joints.push([x,y]);};
    for(const r of runs){addJoint(r.x1,r.y1);addJoint(r.x2,r.y2);}
    for(const [x,y] of joints){
      this.body.circle(x,y,5.6).fill({color:Theme.beam,alpha:.7});
      this.plasma.circle(x,y,2.8).fill({color:0xffcdd9,alpha:.9});
      this.core.circle(x,y,1.3).fill({color:0xffffff,alpha:.96});
    }

    if(state.firing){
      const count=quality==='high'?3:quality==='low'?1:2;
      visible.forEach((s,si)=>{
        const dx=s.x2-s.x1,dy=s.y2-s.y1,len=Math.hypot(dx,dy);if(len<12)return;
        const nx=-dy/len,ny=dx/len;
        for(let k=0;k<count;k++){
          const tt=(now*.0019+si*.21+k*.37)%1;if(tt>s.t)continue;
          const ang=now*.015+si+k*2.2+tt*Math.PI*3;
          const amp=3.6+k*.8;
          const x=s.x1+dx*tt+nx*Math.sin(ang)*amp,y=s.y1+dy*tt+ny*Math.sin(ang)*amp;
          this.packets.circle(x,y,k===0?2.1:1.35).fill({color:k===0?0xffffff:Theme.beamHot,alpha:k===0?.8:.5});
        }
      });
    }

    if(state.firing&&origin&&launchAge<240){
      const dir=this.originDir(origin);
      const mx=origin.x1+dir.dx*16,my=origin.y1+dir.dy*16;
      const k=1-launchAge/240,blast=k*k;
      this.head.circle(mx,my,18+blast*26).fill({color:Theme.beam2,alpha:.18*blast});
      this.head.circle(mx,my,8+blast*12).fill({color:0xffffff,alpha:.62*blast});
    }

    const partial=visible.find(s=>s.t<1);
    if(state.firing&&partial){
      const hp=.5+.5*Math.sin(now*.022),dx=partial.x2-partial.x1,dy=partial.y2-partial.y1,len=Math.hypot(dx,dy)||1;
      const nx=-dy/len,ny=dx/len,shock=12+hp*6+punch*10;
      this.head.moveTo(partial.x2-nx*shock,partial.y2-ny*shock).lineTo(partial.x2+nx*shock,partial.y2+ny*shock).stroke({color:0xffffff,width:2.2+punch*2.2,alpha:.4+hp*.18+punch*.22,cap:'round'});
      this.head.circle(partial.x2,partial.y2,12+hp*2.2+punch*7).fill({color:Theme.beam2,alpha:.24+punch*.16});
      this.head.circle(partial.x2,partial.y2,5.6+hp+punch*2.6).fill({color:0xffffff,alpha:.96});
    }
  }
  get active(){return this.animating;}
}
