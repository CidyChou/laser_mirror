import { Container, Graphics } from 'pixi.js';
import { GameConfig } from '@/config/GameConfig';
import { beamScale } from '@/gameplay/geometry';
import type { GameState, LaserSegment, LaserTrace } from '@/gameplay/types';
import type { Quality } from '@/performance/PerformanceManager';
import { isLightTheme, Theme } from '../theme';

type Run={x1:number;y1:number;x2:number;y2:number;startDist:number;endDist:number};
type RunVisual={run:Run;length:number;root:Container;wide:Graphics;body:Graphics;plasma:Graphics;core:Graphics};

export class LaserEffect extends Container{
  static debugPerf=typeof location!=='undefined'&&/[?&]perf=1(?:&|$)/.test(location.search);

  private beam=new Container();
  private packets=new Graphics();
  private joints=new Graphics();
  private head=new Graphics();
  private chargeRoot=new Container();
  private halo=new Graphics();
  private ringA=new Graphics();
  private ringB=new Graphics();
  private sparks=new Container();
  private stub=new Graphics();
  private core=new Graphics();
  private pop=new Graphics();
  private runVisuals:RunVisual[]=[];
  private boundResult:LaserTrace|null=null;
  private animating=false;
  private jointCount=-1;
  private lastQuality:Quality|null=null;
  private frozen=false;
  private cellScale=1;
  private readonly energyBlend = isLightTheme() ? 'normal' : 'add';

  constructor(){
    super();
    this.packets.blendMode=this.energyBlend;
    this.joints.blendMode=this.energyBlend;
    this.head.blendMode=this.energyBlend;
    this.buildCharge();
    this.addChild(this.beam,this.joints,this.packets,this.head,this.chargeRoot);
  }

  bind(_state:GameState, cell=100){
    const next=beamScale(cell);
    if(Math.abs(next-this.cellScale)<=0.02) return;
    this.cellScale=next;
    this.boundResult=null;
    this.frozen=false;
  }

  private axisOf(x1:number,y1:number,x2:number,y2:number){
    return Math.abs(x2-x1)>=Math.abs(y2-y1)?'h':'v';
  }

  private mergeCollinear(segments:LaserSegment[]){
    const runs:Run[]=[];
    for(const s of segments){
      const last=runs[runs.length-1];
      const connected=last&&Math.hypot(s.x1-last.x2,s.y1-last.y2)<1.6;
      const sameAxis=last&&this.axisOf(last.x1,last.y1,last.x2,last.y2)===this.axisOf(s.x1,s.y1,s.x2,s.y2);
      const noPauseGap=last?s.startDist-last.endDist<2:true;
      if(connected&&sameAxis&&noPauseGap){
        last.x2=s.x2;last.y2=s.y2;last.endDist=s.endDist;
      }else{
        runs.push({x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2,startDist:s.startDist,endDist:s.endDist});
      }
    }
    return runs;
  }

  private originDir(seg:LaserSegment){
    const dx=seg.x2-seg.x1,dy=seg.y2-seg.y1,len=Math.hypot(dx,dy)||1;
    return{dx:dx/len,dy:dy/len};
  }

  private strokeLine(width:number,color:number,alpha:number,length:number){
    const g=new Graphics();
    g.blendMode=this.energyBlend;
    g.moveTo(0,0).lineTo(length,0).stroke({color,width,alpha,cap:'round'});
    return g;
  }

  private rebuild(result:LaserTrace){
    this.beam.removeChildren().forEach(c=>c.destroy({children:true}));
    this.runVisuals=[];
    this.jointCount=-1;
    this.lastQuality=null;
    this.frozen=false;
    for(const run of this.mergeCollinear(result.segments)){
      const length=Math.hypot(run.x2-run.x1,run.y2-run.y1)||1;
      const root=new Container();
      root.position.set(run.x1,run.y1);
      root.rotation=Math.atan2(run.y2-run.y1,run.x2-run.x1);
      root.scale.x=0;
      root.visible=false;
      const s=this.cellScale;
      const wide=new Graphics();
      wide.blendMode=this.energyBlend;
      wide.moveTo(0,0).lineTo(length,0).stroke({color:Theme.beam2,width:52*s,alpha:.10,cap:'round'});
      wide.moveTo(0,0).lineTo(length,0).stroke({color:Theme.beam2,width:30*s,alpha:.14,cap:'round'});
      const body=this.strokeLine(12.2*s,Theme.beam,.88,length);
      const plasma=this.strokeLine(5.8*s,Theme.laserPlasma,.94,length);
      const core=this.strokeLine(2.5*s,Theme.laserCore,.98,length);
      root.addChild(wide,body,plasma,core);
      this.beam.addChild(root);
      this.runVisuals.push({run,length,root,wide,body,plasma,core});
    }
  }

  private applyQuality(quality:Quality){
    if(this.lastQuality===quality) return;
    this.lastQuality=quality;
    for(const v of this.runVisuals){
      v.wide.visible=quality==='high';
      v.plasma.visible=quality!=='low';
    }
  }

  private buildCharge(){
    this.halo.blendMode=this.energyBlend;
    this.halo.circle(0,0,26).fill({color:Theme.beam2,alpha:1});
    this.ringA.blendMode=this.energyBlend;
    this.ringA.circle(0,0,26).stroke({color:Theme.beam,width:3,alpha:1});
    this.ringB.blendMode=this.energyBlend;
    this.ringB.circle(0,0,26).stroke({color:Theme.beamHot,width:3,alpha:1});
    this.sparks.blendMode=this.energyBlend;
    for(let i=0;i<7;i++){
      const a=i*Math.PI*2/7;
      const spark=new Graphics().circle(Math.cos(a),Math.sin(a),0.12).fill({color:i%2?Theme.white:Theme.beamHot,alpha:1});
      spark.blendMode=this.energyBlend;
      this.sparks.addChild(spark);
    }
    this.stub.blendMode=this.energyBlend;
    this.stub.moveTo(0,0).lineTo(1,0).stroke({color:Theme.white,width:4,alpha:.7,cap:'round'});
    this.stub.moveTo(0,0).lineTo(1,0).stroke({color:Theme.beam,width:10,alpha:.32,cap:'round'});
    this.core.blendMode=this.energyBlend;
    this.core.circle(0,0,1).fill({color:Theme.white,alpha:1});
    this.pop.blendMode=this.energyBlend;
    this.pop.circle(0,0,1).fill({color:Theme.white,alpha:1});
    this.chargeRoot.addChild(this.halo,this.ringA,this.ringB,this.sparks,this.stub,this.core,this.pop);
    this.chargeRoot.visible=false;
    this.chargeRoot.eventMode='none';
  }

  private updateCharge(origin:LaserSegment,chargeT:number,quality:Quality){
    const dir=this.originDir(origin);
    this.chargeRoot.visible=true;
    const s=this.cellScale;
    this.chargeRoot.position.set(origin.x1+dir.dx*18*s,origin.y1+dir.dy*18*s);
    this.chargeRoot.scale.set(s);
    const inhale=chargeT*chargeT;
    this.halo.scale.set(1-inhale*.55);
    this.halo.alpha=.12*(1-chargeT*.25);
    const phaseA=(chargeT*1.35)%1;
    this.ringA.scale.set((26-phaseA*18)/26);
    this.ringA.alpha=(.32+phaseA*.4)*(1-chargeT*.08);
    const phaseB=(chargeT*1.35+.42)%1;
    this.ringB.scale.set((26-phaseB*18)/26);
    this.ringB.alpha=(.32+phaseB*.4)*(1-chargeT*.08);
    const sparkR=18*(1-Math.pow(chargeT,.85));
    this.sparks.rotation=chargeT*Math.PI*8;
    this.sparks.scale.set(sparkR);
    this.sparks.alpha=.55+chargeT*.4;
    this.stub.visible=chargeT>.28;
    this.stub.rotation=Math.atan2(dir.dy,dir.dx);
    this.stub.scale.set(chargeT>.28?10+chargeT*28:0,1);
    const throb=.72+.28*Math.sin(chargeT*Math.PI*12);
    this.core.scale.set((4.2+chargeT*7.4)*throb);
    this.core.alpha=.78+chargeT*.22;
    const showPop=quality==='high'&&chargeT>.76;
    this.pop.visible=showPop;
    if(showPop){
      const popT=(chargeT-.76)/.24;
      this.pop.scale.set(8+popT*18);
      this.pop.alpha=.28*(1-popT);
    }
    this.sparks.visible=quality==='high';
    this.ringB.visible=quality==='high';
    this.ringA.visible=quality!=='low';
    this.stub.visible=this.stub.visible&&quality!=='low';
  }

  private ensureJoints(dist:number){
    const points:Array<[number,number]>=[];
    const seen=new Set<string>();
    const add=(x:number,y:number)=>{const k=`${Math.round(x)},${Math.round(y)}`;if(seen.has(k))return;seen.add(k);points.push([x,y]);};
    for(const v of this.runVisuals){
      if(v.run.startDist<=dist) add(v.run.x1,v.run.y1);
      if(v.run.endDist<=dist) add(v.run.x2,v.run.y2);
    }
    if(points.length===this.jointCount) return;
    this.jointCount=points.length;
    this.joints.clear();
    const s=this.cellScale;
    for(const [x,y] of points){
      this.joints.circle(x,y,5.6*s).fill({color:Theme.beam,alpha:.7});
      this.joints.circle(x,y,2.8*s).fill({color:Theme.laserPlasma,alpha:.9});
      this.joints.circle(x,y,1.3*s).fill({color:Theme.white,alpha:.96});
    }
  }

  private drawPackets(dist:number,now:number,quality:Quality){
    const count=quality==='high'?3:quality==='medium'?1:0;
    this.packets.clear();
    if(!count) return;
    this.runVisuals.forEach((v,si)=>{
      const span=Math.max(.001,v.run.endDist-v.run.startDist);
      const tVis=Math.min(1,Math.max(0,(dist-v.run.startDist)/span));
      if(tVis<=0||v.length<12) return;
      const dx=v.run.x2-v.run.x1,dy=v.run.y2-v.run.y1;
      const nx=-dy/v.length,ny=dx/v.length;
      const s=this.cellScale;
      for(let k=0;k<count;k++){
        const tt=(now*.0019+si*.21+k*.37)%1;
        if(tt>tVis) continue;
        const ang=now*.015+si+k*2.2+tt*Math.PI*3;
        const amp=(3.6+k*.8)*s;
        const x=v.run.x1+dx*tt+nx*Math.sin(ang)*amp;
        const y=v.run.y1+dy*tt+ny*Math.sin(ang)*amp;
        this.packets.circle(x,y,(k===0?2.1:1.35)*s).fill({color:k===0?Theme.white:Theme.beamHot,alpha:k===0?.8:.5});
      }
    });
  }

  private drawHead(dist:number,now:number,punch:number,origin:LaserSegment|undefined,launchAge:number){
    this.head.clear();
    const s=this.cellScale;
    if(origin&&launchAge<240){
      const dir=this.originDir(origin);
      const mx=origin.x1+dir.dx*16*s,my=origin.y1+dir.dy*16*s;
      const k=1-launchAge/240,blast=k*k;
      this.head.circle(mx,my,(18+blast*26)*s).fill({color:Theme.beam2,alpha:.18*blast});
      this.head.circle(mx,my,(8+blast*12)*s).fill({color:Theme.white,alpha:.62*blast});
    }
    const partial=this.runVisuals.find(v=>{
      const span=Math.max(.001,v.run.endDist-v.run.startDist);
      const t=(dist-v.run.startDist)/span;
      return t>0&&t<1;
    });
    if(!partial) return;
    const span=Math.max(.001,partial.run.endDist-partial.run.startDist);
    const t=Math.min(1,Math.max(0,(dist-partial.run.startDist)/span));
    const x=partial.run.x1+(partial.run.x2-partial.run.x1)*t;
    const y=partial.run.y1+(partial.run.y2-partial.run.y1)*t;
    const dx=partial.run.x2-partial.run.x1,dy=partial.run.y2-partial.run.y1,len=partial.length;
    const nx=-dy/len,ny=dx/len,hp=.5+.5*Math.sin(now*.022),shock=(12+hp*6+punch*10)*s;
    this.head.moveTo(x-nx*shock,y-ny*shock).lineTo(x+nx*shock,y+ny*shock).stroke({color:Theme.white,width:(2.2+punch*2.2)*s,alpha:.4+hp*.18+punch*.22,cap:'round'});
    this.head.circle(x,y,(12+hp*2.2+punch*7)*s).fill({color:Theme.beam2,alpha:.24+punch*.16});
    this.head.circle(x,y,(5.6+hp+punch*2.6)*s).fill({color:Theme.white,alpha:.96});
  }

  private hideOverlays(){
    this.packets.clear();
    this.head.clear();
    this.chargeRoot.visible=false;
  }

  update(state:GameState,now:number,quality:Quality){
    const t0=LaserEffect.debugPerf?performance.now():0;
    this.animating=state.firing;
    if(state.result!==this.boundResult){
      this.boundResult=state.result;
      if(state.result) this.rebuild(state.result);
      else{
        this.beam.removeChildren().forEach(c=>c.destroy({children:true}));
        this.runVisuals=[];
        this.jointCount=-1;
        this.frozen=false;
      }
    }
    this.applyQuality(quality);

    const origin=state.result?.segments[0];
    const chargeT=state.firing?Math.min(1,(now-state.shotStart)/GameConfig.laser.chargeMs):1;
    if(state.firing&&chargeT<1&&origin) this.updateCharge(origin,chargeT,quality);
    else this.chargeRoot.visible=false;

    const dist=state.beamDistance;
    if(!state.result||dist<=0){
      this.beam.visible=false;
      if(this.jointCount!==0){this.joints.clear();this.jointCount=0;}
      this.packets.clear();
      this.head.clear();
      if(LaserEffect.debugPerf){
        const ms=performance.now()-t0;
        if(ms>6) console.log('[laser]',ms.toFixed(2),quality,this.runVisuals.length);
      }
      return;
    }

    this.beam.visible=true;
    if(!state.firing){
      if(!this.frozen){
        this.frozen=true;
        for(const v of this.runVisuals){
          v.root.visible=true;
          v.root.scale.set(1,1);
        }
        this.hideOverlays();
        this.ensureJoints(1e12);
      }
      return;
    }
    this.frozen=false;

    const launchAge=Math.max(0,now-state.shotStart-GameConfig.laser.chargeMs);
    const punch=Math.max(0,1-launchAge/180)**2;
    const breathe=1+0.035*Math.sin(now*.0042)+punch*.12;
    for(const v of this.runVisuals){
      const span=Math.max(.001,v.run.endDist-v.run.startDist);
      const t=Math.min(1,Math.max(0,(dist-v.run.startDist)/span));
      v.root.visible=t>0.001;
      v.root.scale.x=t;
      v.root.scale.y=breathe;
    }
    this.ensureJoints(dist);
    this.drawPackets(dist,now,quality);
    this.drawHead(dist,now,punch,origin,launchAge);

    if(LaserEffect.debugPerf){
      const ms=performance.now()-t0;
      if(ms>6) console.log('[laser]',ms.toFixed(2),quality,this.runVisuals.length);
    }
  }

  get active(){return this.animating;}
}
