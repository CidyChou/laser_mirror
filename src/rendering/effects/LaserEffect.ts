import { Container, FillGradient, Geometry, GlProgram, Graphics, Mesh, Shader, Sprite, type Renderer, type Texture } from 'pixi.js';
import { GameConfig } from '@/config/GameConfig';
import { beamScale, computeGeometry, portMuzzle } from '@/gameplay/geometry';
import { levelEmitters } from '@/gameplay/levelAccess';
import type { GameState, LaserSegment, LaserTrace } from '@/gameplay/types';
import { beamSegments } from '../beamGeometry';
import type { Quality } from '@/performance/PerformanceManager';
import { isLightTheme, Theme } from '../theme';

type Run={x1:number;y1:number;x2:number;y2:number;startDist:number;endDist:number;branch:number;widthScale:number};
type FallbackRun={run:Run;length:number;root:Container;halo:Graphics};
type BeamUniforms={
  uBeamDistance:number;
  uTailDistance:number;
  uTailFade:number;
  uTime:number;
  uFlowStrength:number;
  uPacketCount:number;
  uPunch:number;
  uBreathe:number;
  uGlowRadius:number;
  uHaloStrength:number;
  uHaloColor:Float32Array;
  uMistColor:Float32Array;
  uBodyColor:Float32Array;
  uPlasmaColor:Float32Array;
  uCoreColor:Float32Array;
};

const GLOW_RADIUS=58;
// Shared cross-section for the shader and the baked compatibility gradient.
// Widths are fractions of the halo radius: colour occupies most of the beam.
const BEAM_PROFILE={body:.10,bodyFeather:.045,plasma:.042,plasmaFeather:.033,core:.014,coreFeather:.010};

// Baked once, then shared by the inexpensive mini-game Graphics path.
// Smooth alpha falloff supplies bloom without a full-screen blur pass.
function glowGradient(radial=false){
  const samples=radial?64:256;
  const strength=isLightTheme()?.55:1;
  const stops=Array.from({length:samples+1},(_,i)=>{
    const offset=i/samples,edge=radial?offset:Math.abs(offset*2-1);
    // A faint cool mist surrounds a tighter warm corona. Their falloffs keep
    // the broad glow from reading as one solid red strip.
    const halo=(.19*Math.exp(-edge*edge*3.6)+.44*Math.exp(-edge*edge*28))*(1-smoothstep(.76,1,edge))*strength;
    const haloColor=mixColor(Theme.laserMist,Theme.beam2,1-smoothstep(.12,.46,edge));
    if(radial)return{offset,color:rgba(haloColor,halo)};
    const p=BEAM_PROFILE;
    const body=1-smoothstep(p.body,p.body+p.bodyFeather,edge);
    const plasma=1-smoothstep(p.plasma,p.plasma+p.plasmaFeather,edge);
    const core=1-smoothstep(p.core,p.core+p.coreFeather,edge);
    const color=mixColor(mixColor(mixColor(haloColor,Theme.laserBody,body),Theme.laserPlasma,plasma),Theme.laserCore,core);
    // Bake the layers together: additive strokes would bleach the pink body.
    return{offset,color:rgba(color,Math.max(halo,body*.96,plasma*.98,core))};
  });
  return new FillGradient(radial
    ?{type:'radial',center:{x:.5,y:.5},outerCenter:{x:.5,y:.5},innerRadius:0,outerRadius:.5,colorStops:stops,textureSize:128}
    :{start:{x:0,y:0},end:{x:0,y:1},colorStops:stops,textureSize:256});
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
uniform float uTailDistance;
uniform float uTailFade;
uniform float uTime;
uniform float uFlowStrength;
uniform float uPacketCount;
uniform float uPunch;
uniform float uBreathe;
uniform float uGlowRadius;
uniform float uHaloStrength;
uniform vec3 uHaloColor;
uniform vec3 uMistColor;
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
  reveal*=smoothstep(uTailDistance,uTailDistance+uTailFade,pathDistance);

  float breathPhase=0.5+0.5*sin(uTime*3.15-localDistance*0.012);
  float halo=(0.19*exp(-edge*edge*3.6)+0.44*exp(-edge*edge*28.0))*(1.0-smoothstep(0.76,1.0,edge));

  // Streaks advance at a consistent speed across successive reflections.
  float localPhase=fract((pathDistance-uTime*190.0)/240.0);
  float axisScale=240.0/max(1.0,uGlowRadius*vBeamWidth);
  float packetA=exp(-pow(loopDistance(localPhase,0.20)*axisScale/0.55,2.0));
  float packetB=exp(-pow(loopDistance(localPhase,0.70)*axisScale/0.38,2.0));
  float endFade=smoothstep(0.0,0.4,min(localDistance,runLength-localDistance)/max(1.0,uGlowRadius*vBeamWidth));
  float packet=max(packetA*step(0.5,uPacketCount),packetB*step(1.5,uPacketCount)*0.72)*uFlowStrength*endFade;
  // Only the coloured sheath ripples; the thin axial highlight stays readable.
  float current=sin(pathDistance*0.053-uTime*8.0+sin(pathDistance*0.019-uTime*2.7));
  float shear=current*0.010*uFlowStrength;
  float body=softBand(edge,${BEAM_PROFILE.body}*uBreathe+shear,${BEAM_PROFILE.bodyFeather});
  float plasma=softBand(edge,${BEAM_PROFILE.plasma}*uBreathe+packet*0.009,${BEAM_PROFILE.plasmaFeather});
  float core=softBand(edge,${BEAM_PROFILE.core}*uBreathe,${BEAM_PROFILE.coreFeather});
  float rim=exp(-pow((edge-0.21-shear*2.0)/0.065,2.0))*packet;

  float haloAlpha=(halo*(0.88+breathPhase*0.12+current*0.06*uFlowStrength+uPunch*0.20)+rim*0.23)*uHaloStrength;
  float bodyAlpha=body*0.96;
  float plasmaAlpha=plasma*0.98;
  float coreAlpha=core*0.995;
  float alpha=max(haloAlpha,max(bodyAlpha,max(plasmaAlpha,coreAlpha)));

  vec3 color=mix(uMistColor,uHaloColor,1.0-smoothstep(0.12,0.46,edge));
  color=mix(color,uBodyColor,rim*0.55);
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
  private energyDetails=new Container();
  private packetPool:Sprite[]=[];
  private readonly sparkTexture:Texture;
  private readonly ribbonTexture:Texture;
  private gpuMesh:Mesh<Geometry,Shader>|null=null;
  private gpuShader:Shader|null=null;
  private gpuUniforms:BeamUniforms|null=null;
  private runs:Run[]=[];
  private tailDistance=-1e9;
  private tailFade=1;
  private fallbackRuns:FallbackRun[]=[];
  private joints=new Graphics();
  private head=new Graphics();
  private chargeRoot=new Container();
  private halo=new Graphics();
  private ringA=new Graphics();
  private sparks=new Container();
  private stub=new Graphics();
  private core=new Graphics();
  private pop=new Graphics();
  private boundResult:LaserTrace|null=null;
  private renderSegments:LaserSegment[]=[];
  private animating=false;
  private visualDistance=0;
  private visualTarget=0;
  private visualSpeed=0;
  private visualNow=0;
  private visualFiring=false;
  private jointSignature='';
  private straightJoints=new Set<string>();
  private frozen=false;
  private gpuFailed=false;
  private cellScale=1;
  private readonly energyBlend=isLightTheme()?'normal':'add';
  private readonly beamGlow=glowGradient();
  private readonly pointGlow=glowGradient(true);

  constructor(renderer:Renderer, enableGpu=true){
    super();
    this.gpuShader=enableGpu?this.createGpuShader(renderer):null;
    // Shared fleck and ribbon textures keep both backends animated without
    // rebuilding geometry or applying full-screen bloom each frame.
    const spark=new Graphics().ellipse(0,0,7,4).fill(this.pointGlow)
      .poly([-3,0,0,-1.25,3,0,0,1.25]).fill(Theme.beamHot)
      .ellipse(0,0,1.3,.65).fill(Theme.white);
    this.sparkTexture=renderer.generateTexture({target:spark,resolution:2});spark.destroy();
    const ribbon=new Graphics().ellipse(0,0,28,5).fill(this.pointGlow)
      .poly([-23,0,-4,-1.2,19,0,-4,1.2]).fill({color:Theme.laserBody,alpha:.6})
      .ellipse(-2,0,12,.55).fill({color:Theme.laserPlasma,alpha:.72});
    this.ribbonTexture=renderer.generateTexture({target:ribbon,resolution:2});ribbon.destroy();
    this.energyDetails.blendMode=this.energyBlend;
    this.joints.blendMode=this.energyBlend;
    this.head.blendMode=this.energyBlend;
    this.beamRoot.addChild(this.fallbackBeam);
    this.buildCharge();
    this.addChild(this.beamRoot,this.joints,this.energyDetails,this.head,this.chargeRoot);
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
            uTailDistance:{value:-1e9,type:'f32'},
            uTailFade:{value:1,type:'f32'},
            uTime:{value:0,type:'f32'},
            uFlowStrength:{value:1,type:'f32'},
            uPacketCount:{value:2,type:'f32'},
            uPunch:{value:0,type:'f32'},
            uBreathe:{value:1,type:'f32'},
            uGlowRadius:{value:GLOW_RADIUS,type:'f32'},
            uHaloStrength:{value:isLightTheme()?.55:1,type:'f32'},
            uHaloColor:{value:colorVec(Theme.beam2),type:'vec3<f32>'},
            uMistColor:{value:colorVec(Theme.laserMist),type:'vec3<f32>'},
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

  private clearBeam(){
    if(this.gpuMesh){
      this.beamRoot.removeChild(this.gpuMesh);
      const geometry=this.gpuMesh.geometry;
      this.gpuMesh.destroy();
      geometry.destroy(true);
      this.gpuMesh=null;
    }
    this.fallbackBeam.removeChildren().forEach(child=>child.destroy({children:true}));
    this.fallbackRuns=[];
    this.runs=[];
    this.straightJoints.clear();
    // The join geometry is independent of beamRoot; clear it together with
    // its cache key so reset / abort cannot leave illuminated endpoints.
    this.joints.clear();this.jointSignature='';
    this.energyDetails.visible=false;this.head.clear();
  }

  private rebuild(state:GameState){
    this.clearBeam();
    this.renderSegments=beamSegments(state.result!,state.level,computeGeometry(state.level));
    this.runs=this.mergeCollinear(this.renderSegments).filter(run=>isFiniteRun(run));
    this.jointSignature='';
    this.frozen=false;
    try{
      if(this.gpuShader&&!this.gpuFailed)this.buildGpuBeam();
      else this.buildFallbackBeam();
    }catch(error){
      console.warn('[laser] rebuild failed; using Graphics fallback.',error);
      this.gpuFailed=true;
      this.clearBeam();
      this.runs=this.mergeCollinear(this.renderSegments).filter(run=>isFiniteRun(run));
      this.buildFallbackBeam();
    }
    this.straightJoints=findStraightJoints(this.runs);
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
      root.addChild(halo);
      this.fallbackBeam.addChild(root);
      this.fallbackRuns.push({run,length,root,halo});
    }
  }

  private updateGpuBeam(dist:number,now:number,quality:Quality,punch:number,breathe:number){
    if(!this.gpuUniforms)return;
    this.gpuUniforms.uBeamDistance=dist;
    this.gpuUniforms.uTailDistance=this.tailDistance;
    this.gpuUniforms.uTailFade=this.tailFade;
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
      const from=Math.max(0,Math.min(t,(this.tailDistance-visual.run.startDist)/span));
      visual.root.visible=t-from>.001;
      visual.root.position.set(visual.run.x1+(visual.run.x2-visual.run.x1)*from,visual.run.y1+(visual.run.y2-visual.run.y1)*from);
      visual.root.alpha=smoothstep(this.tailDistance,this.tailDistance+this.tailFade,Math.min(dist,visual.run.endDist));
      visual.root.scale.set(t-from,breathe);
      const breathPhase=.5+.5*Math.sin(now*.00315-visual.run.startDist*.012);
      visual.halo.alpha=.91+breathPhase*.09;
    }
  }

  private updateEnergyDetails(dist:number,now:number,quality:Quality){
    const budget=quality==='high'?72:quality==='medium'?40:16;
    this.energyDetails.visible=true;
    let used=0;
    for(const run of this.runs){
      if(used>=budget)break;
      if(run.startDist>=dist||run.endDist<=this.tailDistance)continue;
      const span=Math.max(.001,run.endDist-run.startDist);
      const dx=run.x2-run.x1,dy=run.y2-run.y1,length=Math.hypot(dx,dy);
      const s=this.cellScale*Math.min(1.65,run.widthScale);
      const count=Math.ceil(length/((quality==='high'?46:quality==='medium'?76:140)*s));
      for(let i=0;i<count&&used<budget;i++){
        const seed=hash(run.x1*.17+run.y1*.31+run.startDist*.07+i*13.7);
        const phase=(now*(.0010+seed*.00055)+seed)%1;
        const t=(i+phase)/count,path=run.startDist+t*span;
        const edgeFade=smoothstep(0,16*s,Math.min(t,1-t)*length);
        const fade=edgeFade*smoothstep(0,10*s,dist-path)*smoothstep(this.tailDistance,this.tailDistance+this.tailFade,path);
        if(fade<.01)continue;
        let packet=this.packetPool[used++];
        if(!packet){
          packet=new Sprite(this.sparkTexture);packet.anchor.set(.5);packet.blendMode=this.energyBlend;
          this.packetPool.push(packet);this.energyDetails.addChild(packet);
        }
        const side=(i%2===0?1:-1)*(7+seed*13+Math.sin(phase*Math.PI)*5)*s;
        const streak=seed>.58;
        packet.visible=true;
        packet.texture=streak?this.ribbonTexture:this.sparkTexture;
        packet.position.set(run.x1+dx*t-dy/length*side,run.y1+dy*t+dx/length*side);
        packet.rotation=Math.atan2(dy,dx)+(streak?Math.sin(phase*Math.PI*2)*.055:(seed-.5)*1.3);
        packet.scale.set(s*(streak?.6+seed*.4:.65+seed*.4),s*(streak?.85:.8));
        packet.alpha=fade*Math.sin(phase*Math.PI)*(.75+seed*.25);
      }
    }
    for(let i=used;i<this.packetPool.length;i++)this.packetPool[i].visible=false;
  }

  private buildCharge(){
    this.halo.blendMode=this.energyBlend;
    this.halo.circle(0,0,42).fill(this.pointGlow);
    this.ringA.blendMode=this.energyBlend;
    this.ringA.circle(0,0,23).stroke({color:Theme.beam,width:2.6,alpha:1});
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
    this.chargeRoot.addChild(this.halo,this.ringA,this.sparks,this.stub,this.core,this.pop);
    this.chargeRoot.visible=false;this.chargeRoot.eventMode='none';
  }

  private updateCharge(origin:LaserSegment,chargeT:number,quality:Quality){
    const dir=this.originDir(origin);
    this.chargeRoot.visible=true;
    const s=this.cellScale;
    this.chargeRoot.position.set(origin.x1,origin.y1);
    this.chargeRoot.scale.set(s);
    const inhale=chargeT*chargeT;
    this.halo.scale.set(1-inhale*.36);this.halo.alpha=.65+chargeT*.3;
    const phase=(chargeT*1.45)%1;
    this.ringA.scale.set((23-phase*15)/23);this.ringA.alpha=(.28+phase*.48)*(1-chargeT*.1);
    const sparkR=17*(1-Math.pow(chargeT,.82));
    this.sparks.rotation=chargeT*Math.PI*.8;this.sparks.scale.set(sparkR);this.sparks.alpha=.5+chargeT*.38;
    this.stub.rotation=Math.atan2(dir.dy,dir.dx);this.stub.scale.set(chargeT>.4?4+chargeT*9:0,1);
    const throb=.78+.22*Math.sin(chargeT*Math.PI*10);
    this.core.scale.set((2.5+chargeT*3.8)*throb);this.core.alpha=.8+chargeT*.2;
    const showPop=quality==='high'&&chargeT>.8;
    this.pop.visible=showPop;
    if(showPop){const t=(chargeT-.8)/.2;this.pop.scale.set(7+t*15);this.pop.alpha=.22*(1-t);}
    this.sparks.visible=quality!=='low';
  }

  private ensureJoints(dist:number){
    const points=new Map<string,{x:number;y:number;width:number}>();
    const add=(x:number,y:number,width:number)=>{
      const key=jointKey(x,y),existing=points.get(key);
      if(!existing||existing.width<width)points.set(key,{x,y,width});
    };
    for(const run of this.runs){
      if(run.startDist<=dist&&run.startDist>=this.tailDistance+this.tailFade&&!this.straightJoints.has(jointKey(run.x1,run.y1)))add(run.x1,run.y1,run.widthScale);
      if(run.endDist<=dist&&run.endDist>=this.tailDistance+this.tailFade&&!this.straightJoints.has(jointKey(run.x2,run.y2)))add(run.x2,run.y2,run.widthScale);
    }
    const signature=[...points].map(([key,p])=>`${key}:${p.width}`).join('|');
    if(signature===this.jointSignature)return;
    this.jointSignature=signature;this.joints.clear();
    const muzzles=new Set(this.runs.filter(run=>run.startDist===0).map(run=>jointKey(run.x1,run.y1)));
    const light=isLightTheme();
    for(const {x,y,width} of points.values()){
      const s=this.cellScale*width;
      const muzzle=light&&muzzles.has(jointKey(x,y));
      const boost=muzzle?1.45:1;
      this.joints.circle(x,y,46*s*boost).fill({fill:this.pointGlow,alpha:.9});
      // Compact, irregular splinters keep reflections sharp in the win poster,
      // where transient impact particles have already faded out.
      const flareScale=this.cellScale*Math.min(width,1.65)*boost;
      for(let i=0;i<7;i++){
        const seed=hash(x*.13+y*.27+i*9.1),angle=i*2.399+seed*.65;
        const ux=Math.cos(angle),uy=Math.sin(angle),length=(10+seed*16)*flareScale;
        const base=1.1*flareScale;
        this.joints.poly([x-uy*base,y+ux*base,x+ux*length,y+uy*length,x+uy*base,y-ux*base])
          .fill({color:i%3===0?Theme.white:Theme.beamHot,alpha:.48+seed*.35});
      }
      this.joints.circle(x,y,6.8*s*boost).fill({color:Theme.laserBody,alpha:.88});
      this.joints.circle(x,y,2.8*s*boost).fill({color:Theme.laserPlasma,alpha:.94});
      this.joints.circle(x,y,1.2*s*boost).fill({color:Theme.laserCore,alpha:1});
    }
  }

  private drawHead(dist:number,now:number,punch:number,origin:LaserSegment|undefined,launchAge:number){
    this.head.clear();
    const s=this.cellScale;
    if(origin&&launchAge<210){
      const fade=1-launchAge/210,blast=fade*fade;
      const mx=origin.x1,my=origin.y1;
      this.head.circle(mx,my,(24+blast*28)*s).fill({fill:this.pointGlow,alpha:.9*blast});
      this.head.circle(mx,my,(3+blast*4)*s).fill({color:Theme.laserPlasma,alpha:.7*blast});
    }
    for(const partial of this.runs){
      const progress=(dist-partial.startDist)/Math.max(.001,partial.endDist-partial.startDist);
      if(!(progress>0&&progress<1))continue;
      const s=this.cellScale*partial.widthScale;
    const span=Math.max(.001,partial.endDist-partial.startDist);
    const t=Math.min(1,Math.max(0,(dist-partial.startDist)/span));
    const x=partial.x1+(partial.x2-partial.x1)*t,y=partial.y1+(partial.y2-partial.y1)*t;
    const dx=partial.x2-partial.x1,dy=partial.y2-partial.y1,len=Math.hypot(dx,dy)||1;
    const ux=dx/len,uy=dy/len,pulse=.5+.5*Math.sin(now*.024);
    const tail=(13+punch*8)*s;
    this.head.moveTo(x-ux*tail,y-uy*tail).lineTo(x-ux*2*s,y-uy*2*s).stroke({color:Theme.beam,width:(12+punch*2.4)*s,alpha:.5+punch*.16,cap:'round'});
    this.head.moveTo(x-ux*tail*.75,y-uy*tail*.75).lineTo(x,y).stroke({color:Theme.laserCore,width:1.8*s,alpha:.92,cap:'round'});
    this.head.circle(x,y,(36+punch*10)*s).fill(this.pointGlow);
    this.head.circle(x,y,(3.2+pulse*.25+punch*.7)*s).fill({color:Theme.laserPlasma,alpha:.9});
    this.head.circle(x,y,(1.3+punch*.3)*s).fill({color:Theme.laserCore,alpha:1});
    }
  }

  /** Interpolate the fixed-step simulation clock so the snake head and tail
   * advance together between 10ms logic ticks instead of visibly jumping. */
  private smoothDistance(state:GameState,now:number){
    const target=state.beamDistance;
    if(!state.timeSkill||!state.firing||target<=0){
      this.visualDistance=target;this.visualTarget=target;this.visualSpeed=0;this.visualNow=now;this.visualFiring=state.firing;
      return target;
    }
    if(!this.visualFiring||target+this.cellScale*2<this.visualDistance){
      this.visualDistance=target;this.visualSpeed=0;
    }else{
      const dt=Math.min(50,Math.max(0,now-this.visualNow));
      const targetDelta=target-this.visualTarget;
      if(targetDelta>0&&dt>0)this.visualSpeed=targetDelta/dt;
      if(this.visualSpeed>0)this.visualDistance=Math.min(target,this.visualDistance+this.visualSpeed*dt);
      else this.visualDistance=target;
    }
    this.visualTarget=target;this.visualNow=now;this.visualFiring=true;
    return this.visualDistance;
  }

  private hideOverlays(){
    this.energyDetails.visible=false;this.head.clear();this.chargeRoot.visible=false;
  }

  private chargeOrigin(state:GameState):LaserSegment|undefined{
    const port=levelEmitters(state.level)[0];
    if(!port)return undefined;
    const p=portMuzzle(computeGeometry(state.level),port);
    const [dx,dy]=port.side==='W'?[1,0]:port.side==='E'?[-1,0]:port.side==='N'?[0,1]:[0,-1];
    return{x1:p.x,y1:p.y,x2:p.x+dx*12,y2:p.y+dy*12,startDist:0,endDist:12,branch:0};
  }

  update(state:GameState,now:number,quality:Quality,inputCharge:number|null=null){
    const t0=LaserEffect.debugPerf?performance.now():0;
    this.animating=state.firing;
    if(state.result!==this.boundResult){
      this.boundResult=state.result;
      if(state.result)this.rebuild(state);
      else{this.clearBeam();this.renderSegments=[];this.jointSignature='';this.frozen=false;}
    }

    const origin=inputCharge!==null?this.chargeOrigin(state):this.renderSegments[0];
    const chargeT=inputCharge!==null?inputCharge:state.firing?Math.min(1,state.shotElapsedMs/GameConfig.laser.chargeMs):1;
    if((inputCharge!==null||state.firing)&&chargeT<1&&origin)this.updateCharge(origin,chargeT,quality);
    else this.chargeRoot.visible=false;

    const dist=this.smoothDistance(state,now);
    const life=state.timeSkill?.beamLife??1;
    const tailLength=computeGeometry(state.level).cell*GameConfig.laser.challengeTailCells*life;
    this.tailFade=state.timeSkill?Math.max(.01,Math.min(computeGeometry(state.level).cell,tailLength*.35)):1;
    this.tailDistance=state.timeSkill?dist-tailLength:-1e9;
    this.head.alpha=state.timeSkill?Math.min(1,life*8):1;
    if(!state.result||dist<=0){
      this.beamRoot.visible=false;
      if(this.jointSignature){this.joints.clear();this.jointSignature='';}
      this.energyDetails.visible=false;this.head.clear();
      this.logPerf(t0,quality);
      return;
    }

    this.beamRoot.visible=true;
    if(!state.firing){
      if(!this.frozen){
        this.frozen=true;
        const visibleDistance=state.timeSkill?state.beamDistance:1e12;
        this.updateGpuBeam(visibleDistance,now,quality,0,1);
        this.updateFallbackBeam(visibleDistance,1,now);
        this.hideOverlays();this.ensureJoints(visibleDistance);
        this.updateEnergyDetails(visibleDistance,now,quality);
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
    this.updateEnergyDetails(dist,now,quality);
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
    this.sparkTexture.destroy(true);this.ribbonTexture.destroy(true);
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

function mixColor(a:number,b:number,t:number){
  const channel=(shift:number)=>Math.round(((a>>shift)&255)*(1-t)+((b>>shift)&255)*t);
  return(channel(16)<<16)|(channel(8)<<8)|channel(0);
}

function colorVec(color:number){
  return new Float32Array([((color>>16)&255)/255,((color>>8)&255)/255,(color&255)/255]);
}

function isFiniteRun(run:Run){
  const length=Math.hypot(run.x2-run.x1,run.y2-run.y1);
  return Number.isFinite(length)&&length>=0.5
    &&Number.isFinite(run.startDist)&&Number.isFinite(run.endDist);
}

function jointKey(x:number,y:number){return`${Math.round(x)},${Math.round(y)}`;}

function hash(value:number){const n=Math.sin(value*127.1)*43758.5453;return n-Math.floor(n);}

function findStraightJoints(runs:Run[]){
  const directions=new Map<string,{x:number;y:number}[]>();
  const add=(x:number,y:number,dx:number,dy:number)=>{
    const length=Math.hypot(dx,dy);
    if(length<.5)return;
    const direction={x:dx/length,y:dy/length};
    const key=jointKey(x,y),atPoint=directions.get(key)??[];
    if(!atPoint.some(other=>Math.abs(other.x-direction.x)<.01&&Math.abs(other.y-direction.y)<.01))atPoint.push(direction);
    directions.set(key,atPoint);
  };
  for(const run of runs){
    add(run.x1,run.y1,run.x2-run.x1,run.y2-run.y1);
    add(run.x2,run.y2,run.x1-run.x2,run.y1-run.y2);
  }
  const straight=new Set<string>();
  for(const [key,atPoint] of directions){
    if(atPoint.length!==2)continue;
    const [a,b]=atPoint;
    if(Math.abs(a.x*b.y-a.y*b.x)<.01&&a.x*b.x+a.y*b.y<-.99)straight.add(key);
  }
  return straight;
}
