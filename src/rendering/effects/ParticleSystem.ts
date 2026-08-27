import { Graphics, Particle, ParticleContainer, type Renderer } from 'pixi.js';
import type { Quality } from '@/performance/PerformanceManager';

type EmitDir={angle:number;spread:number;speedMin?:number;speedMax?:number};
type ActiveParticle={p:Particle;vx:number;vy:number;life:number;max:number};
export class ParticleSystem {
  readonly container: ParticleContainer;
  private activeParticles:ActiveParticle[]=[];
  private pool:Particle[]=[];
  private readonly texture:any;
  constructor(renderer:Renderer){
    const dot=new Graphics().circle(4,4,4).fill(0xffffff);this.texture=renderer.generateTexture(dot);dot.destroy();
    this.container=new ParticleContainer({dynamicProperties:{position:true,vertex:false,rotation:false,color:true}});
  }
  emit(x:number,y:number,color:number,count:number,budget:number,dir?:EmitDir){
    count=Math.min(count,Math.max(0,budget-this.activeParticles.length));
    for(let i=0;i<count;i++){
      const p=this.pool.pop()??new Particle({texture:this.texture});
      const a=dir?dir.angle+(Math.random()-.5)*dir.spread:Math.random()*Math.PI*2;
      const s=dir
        ?(dir.speedMin??1.1)+Math.random()*((dir.speedMax??4.4)-(dir.speedMin??1.1))
        :.7+Math.random()*3.4;
      p.x=x;p.y=y;p.alpha=.9;p.tint=color;const size=.35+Math.random()*.7;p.scaleX=size;p.scaleY=size;this.container.addParticle(p);
      this.activeParticles.push({p,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:18+Math.random()*25,max:43});
    }
  }
  update(_quality:Quality){
    for(let i=this.activeParticles.length-1;i>=0;i--){const a=this.activeParticles[i];a.p.x+=a.vx;a.p.y+=a.vy;a.vx*=.965;a.vy*=.965;a.life--;a.p.alpha=Math.max(0,a.life/a.max)*.82;if(a.life<=0){this.container.removeParticle(a.p);this.pool.push(a.p);this.activeParticles.splice(i,1);}}
  }
  get active(){return this.activeParticles.length>0;}
  destroy(){this.container.destroy();this.texture.destroy();}
}
