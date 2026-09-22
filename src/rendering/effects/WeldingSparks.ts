import { Container, Graphics } from 'pixi.js';
import { isLightTheme, Theme } from '../theme';

const random=(n:number)=>{const v=Math.sin(n*127.1)*43758.5453;return v-Math.floor(v);};
const WINDOW_MS=720;
type Flight={
  start:number;life:number;vx:number;vy:number;drag:number;gravity:number;
  x:number;y:number;trail:number;thickness:number;brightness:number;flicker:number;phase:number;
};
type Fleck={root:Container;previous:Flight|null;current:Flight|null};

/** Pooled hot droplets: fast ejection, curved flight, then cooling embers.
 * Geometry is built once; animation only changes transforms and opacity. */
export class WeldingSparks extends Container {
  private flecks:Fleck[]=[];
  private variation=Math.random()*1e6;
  private scheduleKey='';

  constructor(){
    super();
    this.eventMode='none';
    for(let i=0;i<12;i++){
      const fleck=new Container();
      const trail=new Graphics()
        .moveTo(-1,.15).quadraticCurveTo(-.45,-.05,0,0)
        .stroke({color:Theme.laserBody,width:2.5,alpha:.16})
        .poly([-1,.15,-.55,-.14,0,-.36,.08,0,0,.36,-.55,.12])
        .fill({color:Theme.laserPlasma,alpha:.75})
        .ellipse(0,0,.12,.42).fill({color:Theme.laserCore,alpha:.95});
      trail.blendMode=isLightTheme()?'normal':'add';
      fleck.addChild(trail);this.addChild(fleck);
      this.flecks.push({root:fleck,previous:null,current:null});
    }
  }

  reset(){
    this.variation=Math.random()*1e6;
    this.scheduleKey='';
    for(const fleck of this.flecks)fleck.root.visible=false;
  }

  private flight(seed:number,index:number,window:number,burst:boolean):Flight|null{
    const group=seed+window*91.73;
    const key=group+index*17.13;
    // Each batch has a different density and a loose spray direction. Some
    // droplets escape the fan, so the contact never becomes a radial star.
    const density=burst?.6+random(group+3)*.35:.24+random(group+3)*.65;
    if(random(key+12)>density)return null;
    const clustered=random(key+18)<.72;
    const start=burst?random(key+6)*85:window*WINDOW_MS+(clustered
      ?random(group+5)*470+random(key+6)*160:random(key+6)*WINDOW_MS);
    const angle=clustered?random(group+8)*Math.PI*2+(random(key+7)-.5)*2.3:random(key+7)*Math.PI*2;
    const fast=random(key+10)>.83;
    const speed=fast?170+random(key+4)*100:45+random(key+4)*115;
    return{start,life:130+random(key+9)*(fast?260:190),
      vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
      drag:2.4+random(key+11)*4.8,gravity:85+random(key+14)*160,
      x:(random(key+15)-.5)*4,y:(random(key+16)-.5)*4,
      trail:fast?.035+random(key+8)*.04:.008+random(key+8)*.03,
      thickness:(.45+random(key+1)*.85)*(random(key+19)<.5?-1:1),
      brightness:.5+random(key+20)*.5,flicker:21+random(key+21)*46,phase:random(key+22)*Math.PI*2};
  }

  animate(now:number,seed:number,count=10,burstAge?:number){
    const burst=burstAge!==undefined,clock=burstAge??now;
    const window=burst?0:Math.floor(clock/WINDOW_MS);
    const key=`${seed}:${window}:${burst}`;
    if(key!==this.scheduleKey){
      this.scheduleKey=key;
      for(let i=0;i<this.flecks.length;i++){
        const fleck=this.flecks[i],salt=seed+this.variation;
        fleck.current=this.flight(salt,i,window,burst);
        fleck.previous=burst?null:this.flight(salt,i,window-1,false);
      }
    }
    for(let i=0;i<this.flecks.length;i++){
      const {root,current,previous}=this.flecks[i];
      const flight=current&&clock>=current.start?current:previous;
      const age=flight?clock-flight.start:-1;
      if(i>=count||!flight||age<0||age>=flight.life){root.visible=false;continue;}
      const t=age*.001,u=age/flight.life;
      const drag=Math.exp(-flight.drag*t),travel=(1-drag)/flight.drag;
      const dx=flight.vx*drag,dy=flight.vy*drag+flight.gravity*t;
      root.visible=true;
      root.position.set(flight.x+flight.vx*travel,flight.y+flight.vy*travel+.5*flight.gravity*t*t);
      root.rotation=Math.atan2(dy,dx);
      root.scale.set(Math.max(.65,Math.hypot(dx,dy)*flight.trail)*(1-u*.6),flight.thickness);
      const shimmer=.88+.12*Math.sin(t*flight.flicker+flight.phase);
      root.alpha=Math.min(1,age/10)*Math.pow(1-u,.9)*flight.brightness*shimmer;
    }
  }
}
