import { Container, Graphics } from 'pixi.js';
import { borderPoint, cellCenter } from '@/gameplay/geometry';
import type { BoardGeometry, GameState, LevelItem, Port } from '@/gameplay/types';
import { Theme } from '../theme';

type ItemNode={key:string;kind:LevelItem['type'];root:Container;motion:Container;angleCarrier?:Container;face?:Graphics;core?:Graphics;phase:number;lastLit?:boolean;lastOpen?:boolean};
type Kick={start:number};
type ClickFx={root:Container;ring:Graphics;flash:Graphics;start:number;active:boolean};
type PortNode={port:Port;emitter:boolean;targetIndex?:number;root:Container;band:Graphics;detail:Container;phase:number;lastActive:boolean|null};

export class ObjectLayer extends Container{
  private portLayer=new Container();
  private itemLayer=new Container();
  private feedbackLayer=new Container();
  private itemNodes=new Map<string,ItemNode>();
  private portNodes:PortNode[]=[];
  private kicks=new Map<string,Kick>();
  private clickPool:ClickFx[]=[];
  private rotateHandler:(x:number,y:number)=>void=()=>{};
  private levelIndex=-1;

  constructor(){
    super();this.addChild(this.portLayer,this.itemLayer,this.feedbackLayer);
    for(let i=0;i<12;i++){
      const root=new Container();root.visible=false;
      const ring=new Graphics().circle(0,0,20).stroke({color:Theme.cyan,width:2.4,alpha:.72}); ring.blendMode='add';
      const flash=new Graphics().moveTo(-17,0).lineTo(17,0).stroke({color:Theme.white,width:1.5,alpha:.68}).moveTo(0,-17).lineTo(0,17).stroke({color:Theme.cyanSoft,width:1.4,alpha:.58}); flash.blendMode='add';
      root.addChild(ring,flash);this.feedbackLayer.addChild(root);this.clickPool.push({root,ring,flash,start:0,active:false});
    }
  }
  setRotateHandler(fn:(x:number,y:number)=>void){this.rotateHandler=fn;}

  rotateItem(x:number,y:number,s:0|1){
    const n=this.itemNodes.get(`${x},${y}`);
    if(!n?.angleCarrier) return;
    n.angleCarrier.rotation=s===0?Math.PI/4:-Math.PI/4;
  }

  sync(state:GameState,g:BoardGeometry){
    if(this.levelIndex!==state.levelIndex){this.levelIndex=state.levelIndex;this.rebuild(state,g);}
    this.refresh(state,g);
  }
  private rebuild(state:GameState,g:BoardGeometry){
    this.portLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.itemLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.itemNodes.clear();this.portNodes=[];
    const emitter=this.makePort(state.level.emitter,g,true);this.portNodes.push(emitter);this.portLayer.addChild(emitter.root);
    state.targets.forEach((t,i)=>{const n=this.makePort(t,g,false,i);this.portNodes.push(n);this.portLayer.addChild(n.root);});
    for(const item of state.items){const n=this.makeItem(item,state,g);this.itemLayer.addChild(n.root);this.itemNodes.set(n.key,n);if((item.type==='mirror'||item.type==='splitter')&&!item.fixed){n.root.eventMode='static';n.root.cursor='pointer';n.root.on('pointertap',()=>this.rotateHandler(item.x,item.y));}}
  }
  private refresh(state:GameState,g:BoardGeometry){
    this.portNodes.forEach(n=>this.refreshPort(n,state,g));
    state.items.forEach(item=>{
      const n=this.itemNodes.get(`${item.x},${item.y}`);if(!n)return;
      n.root.position.copyFrom(cellCenter(g,item.x,item.y));
      if((item.type==='mirror'||item.type==='splitter')&&n.angleCarrier)n.angleCarrier.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      if(item.type==='switch'){const lit=state.activeSwitches.has(item.id);if(n.lastLit!==lit){n.lastLit=lit;this.drawSwitch(n,lit,g);}}
      if(item.type==='door'){const open=!!state.activeDoorStates[item.id];if(n.lastOpen!==open){n.lastOpen=open;this.drawDoor(n,open,g);}}
    });
  }

  kick(x:number,y:number,now:number){this.kicks.set(`${x},${y}`,{start:now});}
  rotateFeedback(x:number,y:number,now:number,g:BoardGeometry){const c=cellCenter(g,x,y),fx=this.clickPool.find(v=>!v.active)??this.clickPool[0];fx.active=true;fx.start=now;fx.root.visible=true;fx.root.position.set(c.x,c.y);fx.root.scale.set(.7);fx.root.alpha=1;fx.ring.scale.set(.75);fx.flash.rotation=0;}
  update(now:number){
    for(const [key,k] of [...this.kicks]){const n=this.itemNodes.get(key);if(!n){this.kicks.delete(key);continue;}const t=(now-k.start)/280;if(t>=1){n.motion.scale.set(1);n.motion.position.set(0,0);n.motion.rotation=0;this.kicks.delete(key);continue;}const hit=Math.sin(t*Math.PI)*Math.exp(-t*1.55);n.motion.scale.set(1+hit*.12);n.motion.position.set(0,-hit*6);n.motion.rotation=hit*.028*Math.sin(now*.08);}
    for(const fx of this.clickPool){if(!fx.active)continue;const t=(now-fx.start)/300;if(t>=1){fx.active=false;fx.root.visible=false;continue;}const ease=1-Math.pow(1-t,3);fx.root.scale.set(.7+ease*.65);fx.root.alpha=1-t;fx.ring.scale.set(.75+ease*.85);fx.flash.rotation=t*.22;fx.flash.alpha=(1-t)*.62;}
  }
  get active(){return this.kicks.size>0||this.clickPool.some(x=>x.active);}

  private makeRaisedBase(g:BoardGeometry,top:number){
    const c=new Container(),s=g.cell*.70,d=Math.max(4,g.cell*.05),r=g.cell*.135;
    const shadow=new Graphics().roundRect(-s/2+1,-s/2+d+4,s,s-d,r).fill({color:Theme.shadow,alpha:.34});
    const base=new Graphics().roundRect(-s/2,-s/2,s,s-d,r).fill(top).stroke({color:Theme.white,width:1.2,alpha:.12});
    const rim=new Graphics().roundRect(-s/2+2,-s/2+2,s-4,s-d-4,r*.82).stroke({color:Theme.white,width:1,alpha:.07});
    const sheen=new Graphics().roundRect(-s/2+6,-s/2+6,s-12,(s-d)*.26,r*.65).fill({color:Theme.white,alpha:.05});
    c.addChild(shadow,base,rim,sheen);return c;
  }

  private makeItem(item:LevelItem,state:GameState,g:BoardGeometry):ItemNode{
    const root=new Container(),motion=new Container();root.position.copyFrom(cellCenter(g,item.x,item.y));root.addChild(motion);const key=`${item.x},${item.y}`;
    if(item.type==='mirror'){
      motion.addChild(this.makeRaisedBase(g,item.fixed?Theme.raisedFixed:Theme.raisedMovable));
      const carrier=new Container();carrier.position.y=-g.cell*.02;carrier.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      const s=g.cell*.50;
      const glow=new Graphics().roundRect(-s*.50,-g.cell*.084,s,g.cell*.168,10).fill({color:Theme.cyan,alpha:.08});glow.blendMode='add';
      const blade=new Graphics().roundRect(-s/2,-g.cell*.062,s,g.cell*.124,9).fill(Theme.mirrorBlade).stroke({color:Theme.white,width:1.2,alpha:.62});
      const hot=new Graphics().roundRect(-s*.28,-g.cell*.038,s*.56,g.cell*.076,6).fill({color:Theme.mirrorCore,alpha:.9});
      const sheen=new Graphics().moveTo(-s*.23,-g.cell*.012).lineTo(s*.18,-g.cell*.012).stroke({color:Theme.white,width:1.7,alpha:.68});
      carrier.addChild(glow,blade,hot,sheen);motion.addChild(carrier);
      if(item.fixed){const lock=new Graphics().roundRect(-10,g.cell*.18,20,12,4).fill(Theme.lock).roundRect(-3,g.cell*.22,6,8,2).fill(Theme.lockKey);motion.addChild(lock);}
      return{key,kind:item.type,root,motion,angleCarrier:carrier,phase:0};
    }
    if(item.type==='splitter'){
      motion.addChild(this.makeRaisedBase(g,item.fixed?Theme.splitterFixed:Theme.splitterMovable));
      const gem=new Container();gem.position.y=-g.cell*.018;gem.rotation=Math.PI/4;
      const s=g.cell*.34;
      const halo=new Graphics().roundRect(-s*.60,-s*.60,s*1.2,s*1.2,10).fill({color:Theme.cyan,alpha:.07});halo.blendMode='add';
      const tile=new Graphics().roundRect(-s/2,-s/2,s,s,8).fill(Theme.splitterGem).stroke({color:Theme.white,width:1.6,alpha:.72});
      const center=new Graphics().roundRect(-s*.17,-s*.17,s*.34,s*.34,4).fill({color:Theme.white,alpha:.2});
      gem.addChild(halo,tile,center);motion.addChild(gem);
      const dir=new Container();dir.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      const railGlow=new Graphics().moveTo(-g.cell*.20,0).lineTo(g.cell*.20,0).stroke({color:Theme.cyan,width:4.8,alpha:.14});railGlow.blendMode='add';
      const rail=new Graphics().moveTo(-g.cell*.19,0).lineTo(g.cell*.19,0).stroke({color:Theme.white,width:2.4,alpha:.88});
      dir.addChild(railGlow,rail);motion.addChild(dir);
      return{key,kind:item.type,root,motion,angleCarrier:dir,phase:0};
    }
    if(item.type==='wall'){
      const s=g.cell*.76,d=g.cell*.12;const sh=new Graphics().roundRect(-s/2+2,-s/2+d+7,s,s-d,g.cell*.12).fill({color:Theme.shadow,alpha:.42});const q=new Graphics().roundRect(-s/2,-s/2,s,s-d,g.cell*.12).fill(Theme.wallFace).stroke({color:Theme.white,width:1,alpha:.10}).roundRect(-s/2+2,g.cell*.02,s-4,s*.31,g.cell*.08).fill({color:Theme.wallInset,alpha:.45});motion.addChild(sh,q);return{key,kind:item.type,root,motion,phase:0};
    }
    if(item.type==='switch'){
      const face=new Graphics(),core=new Graphics();motion.addChild(face,core);const lit=state.activeSwitches.has(item.id);const n={key,kind:item.type,root,motion,face,core,phase:0,lastLit:lit};this.drawSwitch(n,lit,g);return n;
    }
    if(item.type==='door'){
      const face=new Graphics();motion.addChild(face);const open=!!state.activeDoorStates[item.id];const n={key,kind:item.type,root,motion,face,phase:0,lastOpen:open};this.drawDoor(n,open,g);return n;
    }
    const col=item.pair==='P1'?Theme.purple:Theme.cyan;const portal=new Graphics().ellipse(0,0,g.cell*.24,g.cell*.17).stroke({color:col,width:5,alpha:1}).ellipse(0,0,g.cell*.15,g.cell*.10).stroke({color:Theme.white,width:1.5,alpha:.65});portal.blendMode='add';motion.addChild(portal);return{key,kind:item.type,root,motion,phase:0};
  }

  private drawSwitch(n:ItemNode,lit:boolean,g:BoardGeometry){if(!n.face||!n.core)return;n.face.clear().circle(0,0,g.cell*.20).fill(lit?Theme.green:Theme.switchOff).circle(0,0,g.cell*.27).stroke({color:lit?Theme.switchOnRing:Theme.switchOffRing,width:3,alpha:1});n.core.clear().circle(0,0,g.cell*.055).fill(lit?Theme.white:Theme.switchOffCore);}
  private drawDoor(n:ItemNode,open:boolean,g:BoardGeometry){if(!n.face)return;n.face.clear();if(open){n.face.roundRect(-g.cell*.34,-g.cell*.34,g.cell*.68,g.cell*.68,10).stroke({color:Theme.cyan,width:3,alpha:.28}).rect(-g.cell*.22,-2,g.cell*.44,4).fill({color:Theme.cyan,alpha:.50});}else{n.face.roundRect(-g.cell*.34,-g.cell*.34,g.cell*.68,g.cell*.68,10).fill(Theme.doorClosed).stroke({color:Theme.doorEdge,width:2,alpha:.70});for(let i=-1;i<=1;i++)n.face.moveTo(i*g.cell*.14,-g.cell*.24).lineTo(i*g.cell*.14,g.cell*.24).stroke({color:Theme.doorBars,width:3,alpha:.55});}}

  private makePort(port:Port,g:BoardGeometry,emitter:boolean,targetIndex?:number){
    const root=new Container();root.position.copyFrom(borderPoint(g,port));
    const band=new Graphics(),detail=new Container();
    const long=g.cell*.56,thick=Math.max(10,g.wall*.65);
    if(port.side==='W'||port.side==='E'){const x=port.side==='W'?-thick*.45:-thick*.55;band.roundRect(x,-long/2,thick,long,6);}
    else{const y=port.side==='N'?-thick*.45:-thick*.55;band.roundRect(-long/2,y,long,thick,6);}
    if(emitter)band.fill(Theme.white);else band.stroke({color:Theme.white,width:3,alpha:1});
    const offset=9;let dx=0,dy=0;if(port.side==='W')dx=-offset;if(port.side==='E')dx=offset;if(port.side==='N')dy=-offset;if(port.side==='S')dy=offset;
    detail.position.set(dx,dy);
    if(emitter){
      const ang={W:0,E:Math.PI,N:Math.PI/2,S:-Math.PI/2}[port.side];
      const tri=new Graphics().poly([18,0,-11,-14,-11,14],true).fill(Theme.white);tri.rotation=ang;tri.blendMode='add';
      const white=new Graphics().poly([9,0,-1,-6,-1,6],true).fill(Theme.white);white.rotation=ang;
      detail.addChild(tri,white);
    }else{
      const ring=new Graphics().circle(0,0,11).stroke({color:Theme.white,width:4,alpha:1}).circle(0,0,3.5).fill(Theme.white);ring.blendMode='add';
      detail.addChild(ring);
    }
    root.addChild(band,detail);
    return{port,emitter,targetIndex,root,band,detail,phase:0,lastActive:null as boolean|null};
  }
  private refreshPort(n:PortNode,state:GameState,_g:BoardGeometry){
    n.root.position.copyFrom(borderPoint(_g,n.port));
    const active=!n.emitter&&n.targetIndex!==undefined?!!state.targets[n.targetIndex]?.hit:false;
    if(n.lastActive===active) return;
    n.lastActive=active;
    const color=n.emitter?Theme.beam:active?Theme.green:Theme.gold;
    n.band.tint=color;
    const tintable=n.emitter?n.detail.children.slice(0,1):n.detail.children;
    for(const child of tintable){
      if('tint' in child) (child as Graphics).tint=color;
    }
  }
}
