import { Container, Graphics, Particle, ParticleContainer, type Renderer, type Texture } from 'pixi.js';
import type { Quality } from '@/performance/PerformanceManager';

export type ParticleShape='dot'|'spark'|'mixed';
export type EmitDirection={
  angle:number;
  spread:number;
  speedMin?:number;
  speedMax?:number;
  shape?:ParticleShape;
  stretch?:number;
};

type ParticleKind='dot'|'spark';
type ActiveParticle={
  p:Particle;
  kind:ParticleKind;
  vx:number;
  vy:number;
  life:number;
  max:number;
  baseScale:number;
  stretch:number;
  spin:number;
};

export class ParticleSystem {
  readonly container=new Container();
  private readonly dots:ParticleContainer;
  private readonly sparks:ParticleContainer;
  private activeParticles:ActiveParticle[]=[];
  private dotPool:Particle[]=[];
  private sparkPool:Particle[]=[];
  private readonly dotTexture:Texture;
  private readonly sparkTexture:Texture;

  constructor(renderer:Renderer){
    const dot=new Graphics()
      .circle(8,8,8).fill({color:0xffffff,alpha:.08})
      .circle(8,8,4.6).fill({color:0xffffff,alpha:.34})
      .circle(8,8,2.1).fill({color:0xffffff,alpha:1});
    this.dotTexture=renderer.generateTexture(dot);dot.destroy();

    const spark=new Graphics()
      .roundRect(0,4,24,8,4).fill({color:0xffffff,alpha:.08})
      .roundRect(2,5.7,20,4.6,2.3).fill({color:0xffffff,alpha:.38})
      .roundRect(5,7,15,2,1).fill({color:0xffffff,alpha:1});
    this.sparkTexture=renderer.generateTexture(spark);spark.destroy();

    const dynamic={position:true,vertex:true,rotation:true,color:true};
    this.dots=new ParticleContainer({texture:this.dotTexture,dynamicProperties:dynamic});
    this.sparks=new ParticleContainer({texture:this.sparkTexture,dynamicProperties:dynamic});
    this.dots.blendMode='add';this.sparks.blendMode='add';
    this.container.addChild(this.dots,this.sparks);
  }

  emit(x:number,y:number,color:number,count:number,budget:number,dir?:EmitDirection){
    count=Math.min(count,Math.max(0,budget-this.activeParticles.length));
    for(let i=0;i<count;i++){
      const kind=pickKind(dir?.shape??'mixed',i);
      const pool=kind==='dot'?this.dotPool:this.sparkPool;
      const texture=kind==='dot'?this.dotTexture:this.sparkTexture;
      const particle=pool.pop()??new Particle({texture,anchorX:.5,anchorY:.5});
      const angle=dir?dir.angle+(Math.random()-.5)*dir.spread:Math.random()*Math.PI*2;
      const speed=dir
        ?(dir.speedMin??1.1)+Math.random()*((dir.speedMax??4.4)-(dir.speedMin??1.1))
        :.7+Math.random()*3.4;
      const baseScale=kind==='dot'?.26+Math.random()*.34:.32+Math.random()*.34;
      const stretch=kind==='spark'?(dir?.stretch??1)+Math.random()*.5:1;
      particle.x=x;particle.y=y;particle.alpha=.9;particle.tint=color;
      particle.rotation=angle;
      if(kind==='spark'){
        particle.scaleX=baseScale*stretch*(1.25+speed*.16);
        particle.scaleY=baseScale*.42;
      }else{
        particle.scaleX=baseScale;particle.scaleY=baseScale;
      }
      const max=kind==='spark'?22+Math.random()*22:18+Math.random()*25;
      (kind==='dot'?this.dots:this.sparks).addParticle(particle);
      this.activeParticles.push({
        p:particle,kind,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        life:max,max,baseScale,stretch,spin:(Math.random()-.5)*.065,
      });
    }
  }

  update(_quality:Quality){
    for(let i=this.activeParticles.length-1;i>=0;i--){
      const active=this.activeParticles[i];
      active.p.x+=active.vx;active.p.y+=active.vy;
      active.vx*=active.kind==='spark'?.958:.966;
      active.vy*=active.kind==='spark'?.958:.966;
      active.life--;
      const remaining=Math.max(0,active.life/active.max);
      active.p.alpha=remaining*.84;
      if(active.kind==='spark'){
        const speed=Math.hypot(active.vx,active.vy);
        active.p.rotation=Math.atan2(active.vy,active.vx)+active.spin*(1-remaining);
        active.p.scaleX=active.baseScale*active.stretch*(1.05+speed*.22)*(.72+remaining*.28);
        active.p.scaleY=active.baseScale*.42*(.78+remaining*.22);
      }else{
        const scale=active.baseScale*(.72+remaining*.28);
        active.p.scaleX=scale;active.p.scaleY=scale;
      }
      if(active.life<=0){
        const container=active.kind==='dot'?this.dots:this.sparks;
        container.removeParticle(active.p);
        (active.kind==='dot'?this.dotPool:this.sparkPool).push(active.p);
        this.activeParticles.splice(i,1);
      }
    }
  }

  get active(){return this.activeParticles.length>0;}

  destroy(){
    this.container.destroy({children:true});
    this.dotTexture.destroy(true);this.sparkTexture.destroy(true);
  }
}

function pickKind(shape:ParticleShape,index:number):ParticleKind{
  if(shape==='dot'||shape==='spark')return shape;
  return index%3===0?'dot':'spark';
}
