import { Container, FillGradient, Geometry, GlProgram, Graphics, Mesh, Shader, type Renderer } from 'pixi.js';
import { GameConfig } from '@/config/GameConfig';
import { beamScale } from '@/gameplay/geometry';
import type { GameState, LaserSegment, LaserTrace } from '@/gameplay/types';
import type { Quality } from '@/performance/PerformanceManager';
import { isLightTheme, Theme } from '../theme';

type Run={x1:number;y1:number;x2:number;y2:number;startDist:number;endDist:number;branch:number;widthScale:number};
type FallbackRun={run:Run;length:number;root:Container;halo:Graphics};
type BeamUniforms={
  uBeamDistance:number;
  uTime:number;
  uFlowStrength:number;
  uPacketCount:number;
  uPunch:number;
  uBreathe:number;
  uGlowRadius:number;
  uHaloColor:Float32Array;
  uBodyColor:Float32Array;
  uPlasmaColor:Float32Array;
  uCoreColor:Float32Array;
};

const GLOW_RADIUS=28;

// Baked once, then shared by the inexpensive mini-game Graphics path.
// Smooth alpha falloff supplies bloom without a full-screen blur pass.
function glowGradient(radial=false){
  const stops=Array.from({length:33},(_,i)=>{
    const offset=i/32,edge=radial?offset:Math.abs(offset*2-1);
    const taper=1-smoothstep(.78,1,edge);
    const alpha=(.32*Math.exp(-edge*edge*6.2)+.18*Math.exp(-edge*edge*25))*taper;
    return{offset,color:rgba(Theme.beam2,alpha)};
  });
  return new FillGradient(radial
    ?{type:'radial',center:{x:.5,y:.5},outerCenter:{x:.5,y:.5},innerRadius:0,outerRadius:.5,colorStops:stops,textureSize:128}
    :{start:{x:0,y:0},end:{x:0,y:1},colorStops:stops,textureSize:128});
}

const BEAM_VERTEX=`
in vec2 aPosition;
in vec4 aBeamData;
in float aBeamWidth;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;

out vec4 vBeamData;
out float vBeamWidth;
out vec4 vColor;

void main(void){
  vec3 localPosition=uTransformMatrix*vec3(aPosition,1.0);
  vec3 worldPosition=uWorldTransformMatrix*localPosition;
  gl_Position=vec4((uProjectionMatrix*worldPosition).xy,0.0,1.0);
  vBeamData=aBeamData;
  vBeamWidth=aBeamWidth;
  vColor=uWorldColorAlpha*uColor;
}
`;

const BEAM_FRAGMENT=`
in vec4 vBeamData;
in float vBeamWidth;
in vec4 vColor;
out vec4 finalColor;

uniform float uBeamDistance;
uniform float uTime;
uniform float uFlowStrength;
uniform float uPacketCount;
uniform float uPunch;
uniform float uBreathe;
uniform float uGlowRadius;
uniform vec3 uHaloColor;
uniform vec3 uBodyColor;
uniform vec3 uPlasmaColor;
uniform vec3 uCoreColor;

float softBand(float edge,float width,float feather){
  return 1.0-smoothstep(width,width+feather,edge);
}

float loopDistance(float value,float center){
  float d=abs(value-center);
  return min(d,1.0-d);
}

void main(void){
  float pathDistance=vBeamData.x;
  float localDistance=vBeamData.y;
  float edge=abs(vBeamData.z);
  float runLength=max(1.0,vBeamData.w);
  float reveal=smoothstep(-1.25,1.25,uBeamDistance-pathDistance);

  float breathPhase=0.5+0.5*sin(uTime*3.15-localDistance*0.012);
  float halo=(0.32*exp(-edge*edge*6.2)+0.18*exp(-edge*edge*25.0))*(1.0-smoothstep(0.78,1.0,edge));

  // Compact, filled beads inside the tube. There is no detached ring contour.
  float localPhase=fract(localDistance/runLength-uTime*0.43);
  float axisScale=runLength/max(1.0,uGlowRadius*vBeamWidth);
  float packetA=exp(-pow(loopDistance(localPhase,0.20)*axisScale/0.14,2.0));
  float packetB=exp(-pow(loopDistance(localPhase,0.70)*axisScale/0.11,2.0));
  float endFade=smoothstep(0.0,0.4,min(localDistance,runLength-localDistance)/max(1.0,uGlowRadius*vBeamWidth));
  float packet=max(packetA*step(0.5,uPacketCount),packetB*step(1.5,uPacketCount)*0.72)*uFlowStrength*endFade;
  float body=softBand(edge,0.17*uBreathe+packet*0.013,0.07);
  float plasma=softBand(edge,0.053*uBreathe+packet*0.026,0.040);
  float core=softBand(edge,0.025*uBreathe+packet*0.029,0.022);

  float haloAlpha=halo*(0.91+breathPhase*0.09+uPunch*0.08)+softBand(edge,0.12,0.14)*packet*0.08;
  float bodyAlpha=body*0.92;
  float plasmaAlpha=plasma*0.96;
  float coreAlpha=core*0.995;
  float alpha=max(haloAlpha,max(bodyAlpha,max(plasmaAlpha,coreAlpha)));

  vec3 color=uHaloColor;
  color=mix(color,uBodyColor,body);
  color=mix(color,uPlasmaColor,plasma);
  color=mix(color,uCoreColor,core);
  alpha=clamp(alpha,0.0,1.0)*reveal*vColor.a;
  finalColor=vec4(color*vColor.rgb*alpha,alpha);
}
`;

export class LaserEffect extends Container{
  static debugPerf=typeof location!=='undefined'&&/[?&]perf=1(?:&|$)/.test(location.search);

  private beamRoot=new Container();
  private fallbackBeam=new Container();
  private fallbackPackets=new Graphics();
  private gpuMesh:Mesh<Geometry,Shader>|null=null;
  private gpuShader:Shader|null=null;
  private gpuUniforms:BeamUniforms|null=null;
  private runs:Run[]=[];
  private fallbackRuns:FallbackRun[]=[];
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
  private boundResult:LaserTrace|null=null;
  private animating=false;
  private jointSignature='';
  private frozen=false;
  private gpuFailed=false;
  private cellScale=1;
  private readonly energyBlend=isLightTheme()?'normal':'add';
  private readonly beamGlow=glowGradient();
  private readonly pointGlow=glowGradient(true);

  constructor(renderer:Renderer, enableGpu=true){
    super();
    this.gpuShader=enableGpu?this.createGpuShader(renderer):null;
    this.fallbackPackets.blendMode=this.energyBlend;
    this.joints.blendMode=this.energyBlend;
    this.head.blendMode=this.energyBlend;
    this.beamRoot.addChild(this.fallbackBeam);
    this.buildCharge();
    this.addChild(this.beamRoot,this.joints,this.fallbackPackets,this.head,this.chargeRoot);
  }

  bind(_state:GameState,cell=100){
    const next=beamScale(cell);
    if(Math.abs(next-this.cellScale)<=0.02)return;
    this.cellScale=next;
    this.boundResult=null;
    this.frozen=false;
  }

  private createGpuShader(renderer:Renderer){
    const forced=typeof location!=='undefined'&&/[?&]beam=fallback(?:&|$)/.test(location.search);
    const simulateFailure=typeof location!=='undefined'&&/[?&]beam=shader-fail(?:&|$)/.test(location.search);
    if(forced)return null;
    try{
      if(simulateFailure)throw new Error('Simulated shader initialization failure');
      const gl=(renderer as Renderer&{gl?:WebGLRenderingContext|WebGL2RenderingContext}).gl;
      if(!gl)return null;
      const glProgram=GlProgram.from({name:'laser-beam',vertex:BEAM_VERTEX,fragment:BEAM_FRAGMENT});
      if(!this.validateProgram(gl,glProgram.vertex??'',glProgram.fragment??''))return null;
      if(LaserEffect.debugPerf){
        const version=typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext?2:1;
        console.info(`[laser] GPU beam initialized on WebGL${version}`);
      }
      const shader=new Shader({
        glProgram,
        resources:{
          beamUniforms:{
            uBeamDistance:{value:0,type:'f32'},
            uTime:{value:0,type:'f32'},
            uFlowStrength:{value:1,type:'f32'},
            uPacketCount:{value:2,type:'f32'},
            uPunch:{value:0,type:'f32'},
            uBreathe:{value:1,type:'f32'},
            uGlowRadius:{value:GLOW_RADIUS,type:'f32'},
            uHaloColor:{value:colorVec(Theme.beam2),type:'vec3<f32>'},
            uBodyColor:{value:colorVec(Theme.laserBody),type:'vec3<f32>'},
            uPlasmaColor:{value:colorVec(Theme.laserPlasma),type:'vec3<f32>'},
            uCoreColor:{value:colorVec(Theme.laserCore),type:'vec3<f32>'},
          },
        },
      });
      this.gpuUniforms=shader.resources.beamUniforms.uniforms as BeamUniforms;
      return shader;
    }catch(error){
      console.warn('[laser] GPU beam unavailable; using Graphics fallback.',error);
      return null;
    }
  }

  private validateProgram(gl:WebGLRenderingContext|WebGL2RenderingContext,vertexSource:string,fragmentSource:string){
    const compile=(type:number,source:string)=>{
      const shader=gl.createShader(type);
      if(!shader)throw new Error('Unable to allocate shader');
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        const message=gl.getShaderInfoLog(shader)||'Shader compilation failed';
        gl.deleteShader(shader);throw new Error(message);
      }
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER,vertexSource);
    const fragment=compile(gl.FRAGMENT_SHADER,fragmentSource);
    const program=gl.createProgram();
    if(!program){gl.deleteShader(vertex);gl.deleteShader(fragment);throw new Error('Unable to allocate shader program');}
    gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    const valid=Boolean(gl.getProgramParameter(program,gl.LINK_STATUS));
    const message=gl.getProgramInfoLog(program);
    gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!valid)throw new Error(message||'Shader link failed');
    return true;
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
      const sameBranch=last?.branch===s.branch;
      const noPauseGap=last?s.startDist-last.endDist<2:true;
      if(connected&&sameAxis&&sameBranch&&noPauseGap&&last.widthScale===(s.widthScale??1)){
        last.x2=s.x2;last.y2=s.y2;last.endDist=s.endDist;
      }else{
        runs.push({x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2,startDist:s.startDist,endDist:s.endDist,branch:s.branch,widthScale:s.widthScale??1});
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

  private clearBeam(){
    if(this.gpuMesh){
      this.beamRoot.removeChild(this.gpuMesh);
      this.gpuMesh.geometry.destroy(true);
      this.gpuMesh.destroy();
      this.gpuMesh=null;
    }
    this.fallbackBeam.removeChildren().forEach(child=>child.destroy({children:true}));
    this.fallbackRuns=[];
    this.runs=[];
    // The join geometry is independent of beamRoot; clear it together with
    // its cache key so reset / abort cannot leave illuminated endpoints.
    this.joints.clear();this.jointSignature='';
    this.fallbackPackets.clear();this.head.clear();
  }

  private rebuild(result:LaserTrace){
    this.clearBeam();
    this.runs=this.mergeCollinear(result.segments).filter(run=>isFiniteRun(run));
    this.jointSignature='';
    this.frozen=false;
    try{
      if(this.gpuShader&&!this.gpuFailed)this.buildGpuBeam();
      else this.buildFallbackBeam();
    }catch(error){
      console.warn('[laser] rebuild failed; using Graphics fallback.',error);
      this.gpuFailed=true;
      this.clearBeam();
      this.runs=this.mergeCollinear(result.segments).filter(run=>isFiniteRun(run));
      this.buildFallbackBeam();
    }
  }

  private buildGpuBeam(){
    if(!this.gpuShader||!this.runs.length)return;
    const positions:number[]=[];
    const data:number[]=[];
    const indices:number[]=[];
    const widths:number[]=[];
    for(const run of this.runs){
      const halfGlow=GLOW_RADIUS*this.cellScale*run.widthScale;
      const dx=run.x2-run.x1,dy=run.y2-run.y1,length=Math.hypot(dx,dy);
      if(!Number.isFinite(length)||length<0.5)continue;
      const nx=-dy/length,ny=dx/length;
      const offset=positions.length/2;
      positions.push(
        run.x1+nx*halfGlow,run.y1+ny*halfGlow,
        run.x1-nx*halfGlow,run.y1-ny*halfGlow,
        run.x2-nx*halfGlow,run.y2-ny*halfGlow,
        run.x2+nx*halfGlow,run.y2+ny*halfGlow,
      );
      data.push(
        run.startDist,0,-1,length,
        run.startDist,0,1,length,
        run.endDist,length,1,length,
        run.endDist,length,-1,length,
      );
      widths.push(run.widthScale,run.widthScale,run.widthScale,run.widthScale);
      indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
    }
    if(!positions.length)return;
    const geometry=new Geometry({
      attributes:{
        aPosition:{buffer:new Float32Array(positions),format:'float32x2'},
        aBeamData:{buffer:new Float32Array(data),format:'float32x4'},
        aBeamWidth:{buffer:new Float32Array(widths),format:'float32'},
      },
      indexBuffer:new Uint16Array(indices),
    });
    this.gpuMesh=new Mesh({geometry,shader:this.gpuShader});
    this.gpuMesh.blendMode=this.energyBlend;
    this.gpuMesh.eventMode='none';
    this.beamRoot.addChildAt(this.gpuMesh,0);
  }

  private buildFallbackBeam(){
    for(const run of this.runs){
      const length=Math.hypot(run.x2-run.x1,run.y2-run.y1)||1;
      const root=new Container();
      root.position.set(run.x1,run.y1);
      root.rotation=Math.atan2(run.y2-run.y1,run.x2-run.x1);
      root.scale.x=0;root.visible=false;
      const s=this.cellScale*run.widthScale;
      const halo=new Graphics().rect(0,-GLOW_RADIUS*s,length,GLOW_RADIUS*2*s).fill(this.beamGlow);
      halo.blendMode=this.energyBlend;
      const body=this.strokeLine(10.8*s,Theme.laserBody,.90,length);
      const plasma=this.strokeLine(3.8*s,Theme.laserPlasma,.90,length);
      const core=this.strokeLine(1.8*s,Theme.laserCore,.99,length);
      root.addChild(halo,body,plasma,core);
      this.fallbackBeam.addChild(root);
      this.fallbackRuns.push({run,length,root,halo});
    }
  }

  private updateGpuBeam(dist:number,now:number,quality:Quality,punch:number,breathe:number){
    if(!this.gpuUniforms)return;
    this.gpuUniforms.uBeamDistance=dist;
    this.gpuUniforms.uTime=now*.001;
    this.gpuUniforms.uFlowStrength=quality==='high'?1:quality==='medium'?.54:0;
    this.gpuUniforms.uPacketCount=quality==='high'?2:quality==='medium'?1:0;
    this.gpuUniforms.uPunch=punch;
    this.gpuUniforms.uBreathe=breathe;
    this.gpuUniforms.uGlowRadius=GLOW_RADIUS*this.cellScale;
  }

  private updateFallbackBeam(dist:number,breathe:number,now:number){
    for(const visual of this.fallbackRuns){
      const span=Math.max(.001,visual.run.endDist-visual.run.startDist);
      const t=Math.min(1,Math.max(0,(dist-visual.run.startDist)/span));
      visual.root.visible=t>.001;
      visual.root.scale.set(t,breathe);
      const breathPhase=.5+.5*Math.sin(now*.00315-visual.run.startDist*.012);
      visual.halo.alpha=.91+breathPhase*.09;
    }
  }

  private drawFallbackPackets(dist:number,now:number,quality:Quality){
    this.fallbackPackets.clear();
    const count=quality==='high'?2:quality==='medium'?1:0;
    if(!count||this.gpuMesh)return;
    this.fallbackRuns.forEach(visual=>{
      const span=Math.max(.001,visual.run.endDist-visual.run.startDist);
      const visible=Math.min(1,Math.max(0,(dist-visual.run.startDist)/span));
      if(visible<=0||visual.length<12)return;
      const dx=visual.run.x2-visual.run.x1,dy=visual.run.y2-visual.run.y1;
      const ux=dx/visual.length,uy=dy/visual.length;
      for(let i=0;i<count;i++){
        const t=(now*.00043+.20+i*.5)%1;
        if(t>visible)continue;
        const x=visual.run.x1+dx*t,y=visual.run.y1+dy*t;
        const s=this.cellScale*visual.run.widthScale,fade=smoothstep(0,11*s,Math.min(t,1-t)*visual.length);
        const radius=(i===0?2.15:1.7)*s;
        this.fallbackPackets.circle(x,y,7*s).fill({fill:this.pointGlow,alpha:fade*.65});
        this.fallbackPackets.moveTo(x-ux*1.25*s,y-uy*1.25*s).lineTo(x+ux*1.25*s,y+uy*1.25*s)
          .stroke({color:Theme.laserCore,width:radius*2,alpha:fade*.78,cap:'round'});
      }
    });
  }

  private buildCharge(){
    this.halo.blendMode=this.energyBlend;
    this.halo.circle(0,0,24).fill({color:Theme.beam2,alpha:1});
    this.ringA.blendMode=this.energyBlend;
    this.ringA.circle(0,0,23).stroke({color:Theme.beam,width:2.6,alpha:1});
    this.ringB.blendMode=this.energyBlend;
    this.ringB.circle(0,0,12).stroke({color:Theme.beamHot,width:2,alpha:1});
    this.sparks.blendMode=this.energyBlend;
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;
      const spark=new Graphics().roundRect(-.8,-.18,1.6,.36,.18).fill({color:i%2?Theme.white:Theme.beamHot,alpha:1});
      spark.rotation=a;spark.blendMode=this.energyBlend;
      this.sparks.addChild(spark);
    }
    this.stub.blendMode=this.energyBlend;
    this.stub.moveTo(0,0).lineTo(1,0).stroke({color:Theme.beam,width:9.5,alpha:.32,cap:'round'});
    this.stub.moveTo(0,0).lineTo(1,0).stroke({color:Theme.white,width:2.4,alpha:.82,cap:'round'});
    this.core.blendMode=this.energyBlend;
    this.core.circle(0,0,1).fill({color:Theme.white,alpha:1});
    this.pop.blendMode=this.energyBlend;
    this.pop.circle(0,0,1).fill({color:Theme.white,alpha:1});
    this.chargeRoot.addChild(this.halo,this.ringA,this.ringB,this.sparks,this.stub,this.core,this.pop);
    this.chargeRoot.visible=false;this.chargeRoot.eventMode='none';
  }

  private updateCharge(origin:LaserSegment,chargeT:number,quality:Quality){
    const dir=this.originDir(origin);
    this.chargeRoot.visible=true;
    const s=this.cellScale;
    this.chargeRoot.position.set(origin.x1+dir.dx*18*s,origin.y1+dir.dy*18*s);
    this.chargeRoot.scale.set(s);
    const inhale=chargeT*chargeT;
    this.halo.scale.set(1-inhale*.54);this.halo.alpha=.13*(1-chargeT*.2);
    const phase=(chargeT*1.45)%1;
    this.ringA.scale.set((23-phase*15)/23);this.ringA.alpha=(.28+phase*.48)*(1-chargeT*.1);
    this.ringB.scale.set(.7+chargeT*.28);this.ringB.alpha=.20+chargeT*.34;
    const sparkR=17*(1-Math.pow(chargeT,.82));
    this.sparks.rotation=chargeT*Math.PI*7;this.sparks.scale.set(sparkR);this.sparks.alpha=.5+chargeT*.38;
    this.stub.rotation=Math.atan2(dir.dy,dir.dx);this.stub.scale.set(chargeT>.25?8+chargeT*27:0,1);
    const throb=.78+.22*Math.sin(chargeT*Math.PI*10);
    this.core.scale.set((4+chargeT*6.8)*throb);this.core.alpha=.8+chargeT*.2;
    const showPop=quality==='high'&&chargeT>.8;
    this.pop.visible=showPop;
    if(showPop){const t=(chargeT-.8)/.2;this.pop.scale.set(7+t*15);this.pop.alpha=.22*(1-t);}
    this.sparks.visible=quality!=='low';
    this.ringB.visible=quality==='high';
  }

  private ensureJoints(dist:number){
    const points=new Map<string,{x:number;y:number;width:number}>();
    const add=(x:number,y:number,width:number)=>{
      const key=`${Math.round(x)},${Math.round(y)}`,existing=points.get(key);
      if(!existing||existing.width<width)points.set(key,{x,y,width});
    };
    for(const run of this.runs){
      if(run.startDist<=dist)add(run.x1,run.y1,run.widthScale);
      if(run.endDist<=dist)add(run.x2,run.y2,run.widthScale);
    }
    const signature=[...points].map(([key,p])=>`${key}:${p.width}`).join('|');
    if(signature===this.jointSignature)return;
    this.jointSignature=signature;this.joints.clear();
    for(const {x,y,width} of points.values()){
      const s=this.cellScale*width;
      this.joints.circle(x,y,18*s).fill({fill:this.pointGlow,alpha:.65});
      this.joints.circle(x,y,5.1*s).fill({color:Theme.laserBody,alpha:.76});
      this.joints.circle(x,y,1.9*s).fill({color:Theme.laserPlasma,alpha:.90});
      this.joints.circle(x,y,.95*s).fill({color:Theme.white,alpha:.98});
    }
  }

  private drawHead(dist:number,now:number,punch:number,origin:LaserSegment|undefined,launchAge:number){
    this.head.clear();
    const s=this.cellScale;
    if(origin&&launchAge<210){
      const dir=this.originDir(origin),fade=1-launchAge/210,blast=fade*fade;
      const mx=origin.x1+dir.dx*17*s,my=origin.y1+dir.dy*17*s;
      this.head.circle(mx,my,(12+blast*17)*s).fill({color:Theme.beam2,alpha:.15*blast});
      this.head.circle(mx,my,(5+blast*7)*s).fill({color:Theme.white,alpha:.5*blast});
    }
    const travelling=this.runs.filter(run=>{
      const t=(dist-run.startDist)/Math.max(.001,run.endDist-run.startDist);
      return t>0&&t<1;
    });
    for(const partial of travelling){
    const s=this.cellScale*partial.widthScale;
    const span=Math.max(.001,partial.endDist-partial.startDist);
    const t=Math.min(1,Math.max(0,(dist-partial.startDist)/span));
    const x=partial.x1+(partial.x2-partial.x1)*t,y=partial.y1+(partial.y2-partial.y1)*t;
    const dx=partial.x2-partial.x1,dy=partial.y2-partial.y1,len=Math.hypot(dx,dy)||1;
    const ux=dx/len,uy=dy/len,pulse=.5+.5*Math.sin(now*.024);
    const tail=(13+punch*8)*s;
    this.head.moveTo(x-ux*tail,y-uy*tail).lineTo(x-ux*2*s,y-uy*2*s).stroke({color:Theme.beam,width:(8.6+punch*1.8)*s,alpha:.38+punch*.16,cap:'round'});
    this.head.moveTo(x-ux*tail*.75,y-uy*tail*.75).lineTo(x,y).stroke({color:Theme.white,width:2.1*s,alpha:.72,cap:'round'});
    this.head.circle(x,y,(18+punch*5)*s).fill(this.pointGlow);
    this.head.circle(x,y,(3.2+pulse*.25+punch*.7)*s).fill({color:Theme.laserPlasma,alpha:.9});
    this.head.circle(x,y,(1.55+punch*.35)*s).fill({color:Theme.white,alpha:1});
    }
  }

  private hideOverlays(){
    this.fallbackPackets.clear();this.head.clear();this.chargeRoot.visible=false;
  }

  update(state:GameState,now:number,quality:Quality){
    const t0=LaserEffect.debugPerf?performance.now():0;
    this.animating=state.firing;
    if(state.result!==this.boundResult){
      this.boundResult=state.result;
      if(state.result)this.rebuild(state.result);
      else{this.clearBeam();this.jointSignature='';this.frozen=false;}
    }

    const origin=state.result?.segments[0];
    const chargeT=state.firing?Math.min(1,state.shotElapsedMs/GameConfig.laser.chargeMs):1;
    if(state.firing&&chargeT<1&&origin)this.updateCharge(origin,chargeT,quality);
    else this.chargeRoot.visible=false;

    const dist=state.beamDistance;
    if(!state.result||dist<=0){
      this.beamRoot.visible=false;
      if(this.jointSignature){this.joints.clear();this.jointSignature='';}
      this.fallbackPackets.clear();this.head.clear();
      this.logPerf(t0,quality);
      return;
    }

    this.beamRoot.visible=true;
    if(!state.firing){
      if(!this.frozen){
        this.frozen=true;
        this.updateGpuBeam(1e12,now,quality,0,1);
        this.updateFallbackBeam(1e12,1,now);
        this.hideOverlays();this.ensureJoints(1e12);
        this.drawFallbackPackets(1e12,now,quality);
      }
      return;
    }
    this.frozen=false;

    const launchAge=Math.max(0,state.shotElapsedMs-GameConfig.laser.chargeMs);
    const punch=Math.max(0,1-launchAge/170)**2;
    const breathe=1+.055*Math.sin(now*.00315)+punch*.09;
    this.updateGpuBeam(dist,now,quality,punch,breathe);
    this.updateFallbackBeam(dist,breathe,now);
    this.ensureJoints(dist);
    this.drawFallbackPackets(dist,now,quality);
    this.drawHead(dist,now,punch,origin,launchAge);
    this.logPerf(t0,quality);
  }

  private logPerf(start:number,quality:Quality){
    if(!LaserEffect.debugPerf)return;
    const elapsed=performance.now()-start;
    if(elapsed>6)console.log('[laser]',elapsed.toFixed(2),quality,this.runs.length,this.gpuMesh?'gpu':'fallback');
  }

  override destroy(options?:any){
    this.clearBeam();
    this.gpuShader?.destroy();
    this.gpuShader=null;this.gpuUniforms=null;
    super.destroy(options);
    this.beamGlow.destroy();this.pointGlow.destroy();
  }

  get active(){return this.animating;}
}

function smoothstep(low:number,high:number,value:number){
  const t=Math.min(1,Math.max(0,(value-low)/(high-low)));
  return t*t*(3-2*t);
}

function rgba(color:number,alpha:number){
  return `rgba(${(color>>16)&255},${(color>>8)&255},${color&255},${alpha})`;
}

function colorVec(color:number){
  return new Float32Array([((color>>16)&255)/255,((color>>8)&255)/255,(color&255)/255]);
}

function isFiniteRun(run:Run){
  const length=Math.hypot(run.x2-run.x1,run.y2-run.y1);
  return Number.isFinite(length)&&length>=0.5
    &&Number.isFinite(run.startDist)&&Number.isFinite(run.endDist);
}
