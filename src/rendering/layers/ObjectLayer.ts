import { Container, Graphics, Rectangle } from 'pixi.js';
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
    for(const item of state.items){const n=this.makeItem(item,state,g);this.itemLayer.addChild(n.root);this.itemNodes.set(n.key,n);if((item.type==='mirror'||item.type==='splitter')&&!item.fixed){n.root.eventMode='static';n.root.cursor='pointer';n.root.hitArea=new Rectangle(-g.cell*.43,-g.cell*.43,g.cell*.86,g.cell*.86);n.root.on('pointertap',()=>this.rotateHandler(item.x,item.y));}}
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

  private makeItem(item:LevelItem,state:GameState,g:BoardGeometry):ItemNode{
    const root=new Container(),motion=new Container();root.position.copyFrom(cellCenter(g,item.x,item.y));root.addChild(motion);const key=`${item.x},${item.y}`;
    if(item.type==='mirror'){
      const carrier=new Container();carrier.position.y=-g.cell*.025;carrier.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      const s=g.cell*.66,thickness=g.cell*.145,radius=Math.max(7,g.cell*.075);
      const glow=new Graphics().roundRect(-s*.52,-thickness*.72,s*1.04,thickness*1.44,radius)
        .fill({color:Theme.cyan,alpha:item.fixed?.055:.105});glow.blendMode='add';
      const shadow=new Graphics().roundRect(-s/2+2,-thickness/2+5,s,thickness,radius)
        .fill({color:Theme.shadow,alpha:.42});
      const edge=new Graphics().roundRect(-s/2,-thickness/2+3,s,thickness,radius)
        .fill(Theme.surfaceSide);
      const blade=new Graphics().roundRect(-s/2,-thickness/2,s,thickness,radius)
        .fill(Theme.mirrorBlade)
        .stroke({color:Theme.white,width:1.35,alpha:.7});
      const hot=new Graphics().roundRect(-s*.31,-thickness*.27,s*.62,thickness*.54,radius*.58)
        .fill({color:Theme.mirrorCore,alpha:.94});
      const sheen=new Graphics().moveTo(-s*.31,-thickness*.12).lineTo(s*.19,-thickness*.12)
        .stroke({color:Theme.white,width:1.9,alpha:.75,cap:'round'});
      carrier.addChild(glow,shadow,edge,blade,hot,sheen);motion.addChild(carrier);
      if(item.fixed){const lock=new Graphics().roundRect(-9,g.cell*.225,18,11,4).fill(Theme.lock).roundRect(-3,g.cell*.255,6,7,2).fill(Theme.lockKey);motion.addChild(lock);}
      return{key,kind:item.type,root,motion,angleCarrier:carrier,phase:0};
    }
    if(item.type==='splitter'){
      const gem=new Container();gem.position.y=-g.cell*.02;gem.rotation=Math.PI/4;
      const s=g.cell*.49,radius=Math.max(7,g.cell*.07);
      const halo=new Graphics().roundRect(-s*.57,-s*.57,s*1.14,s*1.14,radius)
        .fill({color:Theme.cyan,alpha:item.fixed?.05:.10});halo.blendMode='add';
      const shadow=new Graphics().roundRect(-s/2+3,-s/2+5,s,s,radius)
        .fill({color:Theme.shadow,alpha:.42});
      const edge=new Graphics().roundRect(-s/2,-s/2+3,s,s,radius)
        .fill(Theme.surfaceSide);
      const tile=new Graphics().roundRect(-s/2,-s/2,s,s,radius)
        .fill(Theme.splitterGem)
        .stroke({color:Theme.white,width:1.7,alpha:.76});
      const center=new Graphics().roundRect(-s*.18,-s*.18,s*.36,s*.36,4)
        .fill({color:Theme.white,alpha:.24});
      gem.addChild(halo,shadow,edge,tile,center);motion.addChild(gem);
      const dir=new Container();dir.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      const railGlow=new Graphics().moveTo(-g.cell*.275,0).lineTo(g.cell*.275,0).stroke({color:Theme.cyan,width:6,alpha:.16,cap:'round'});railGlow.blendMode='add';
      const rail=new Graphics().moveTo(-g.cell*.255,0).lineTo(g.cell*.255,0).stroke({color:Theme.white,width:2.8,alpha:.92,cap:'round'});
      dir.addChild(railGlow,rail);motion.addChild(dir);
      if(item.fixed){const lock=new Graphics().roundRect(-9,g.cell*.255,18,11,4).fill(Theme.lock).roundRect(-3,g.cell*.285,6,7,2).fill(Theme.lockKey);motion.addChild(lock);}
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
    const color=item.pair==='P1'?Theme.purple:Theme.cyan;
    const portal=new Container();
    const shadow=new Graphics().ellipse(1,g.cell*.055,g.cell*.31,g.cell*.215)
      .fill({color:Theme.shadow,alpha:.42});
    const edge=new Graphics().ellipse(0,g.cell*.035,g.cell*.30,g.cell*.205)
      .fill(Theme.surfaceSide);
    const shell=new Graphics().ellipse(0,0,g.cell*.30,g.cell*.205)
      .fill(color)
      .stroke({color:Theme.white,width:1.2,alpha:.28});
    const aperture=new Graphics().ellipse(0,-g.cell*.006,g.cell*.195,g.cell*.112)
      .fill(Theme.shadow)
      .stroke({color:Theme.white,width:1.4,alpha:.48});
    const highlight=new Graphics()
      .moveTo(-g.cell*.205,-g.cell*.075)
      .bezierCurveTo(-g.cell*.11,-g.cell*.17,g.cell*.09,-g.cell*.17,g.cell*.19,-g.cell*.085)
      .stroke({color:Theme.white,width:2,alpha:.64,cap:'round'});
    portal.addChild(shadow,edge,shell,aperture,highlight);
    motion.addChild(portal);
    return{key,kind:item.type,root,motion,phase:0};
  }

  private drawSwitch(n:ItemNode,lit:boolean,g:BoardGeometry){if(!n.face||!n.core)return;n.face.clear().circle(0,0,g.cell*.20).fill(lit?Theme.green:Theme.switchOff).circle(0,0,g.cell*.27).stroke({color:lit?Theme.switchOnRing:Theme.switchOffRing,width:3,alpha:1});n.core.clear().circle(0,0,g.cell*.055).fill(lit?Theme.white:Theme.switchOffCore);}
  private drawDoor(n:ItemNode,open:boolean,g:BoardGeometry){if(!n.face)return;n.face.clear();if(open){n.face.roundRect(-g.cell*.34,-g.cell*.34,g.cell*.68,g.cell*.68,10).stroke({color:Theme.cyan,width:3,alpha:.28}).rect(-g.cell*.22,-2,g.cell*.44,4).fill({color:Theme.cyan,alpha:.50});}else{n.face.roundRect(-g.cell*.34,-g.cell*.34,g.cell*.68,g.cell*.68,10).fill(Theme.doorClosed).stroke({color:Theme.doorEdge,width:2,alpha:.70});for(let i=-1;i<=1;i++)n.face.moveTo(i*g.cell*.14,-g.cell*.24).lineTo(i*g.cell*.14,g.cell*.24).stroke({color:Theme.doorBars,width:3,alpha:.55});}}

  private makePort(port:Port,g:BoardGeometry,emitter:boolean,targetIndex?:number){
    const root=new Container();root.position.copyFrom(borderPoint(g,port));
    const band=new Graphics(),detail=new Container();
    const long=g.cell;
    const thick=Math.max(5.5,g.cell*.07);
    const radius=thick*.48;
    if(port.side==='W'||port.side==='E')band.roundRect(-thick/2,-long/2,thick,long,radius);
    else band.roundRect(-long/2,-thick/2,long,thick,radius);
    if(emitter)band.fill(Theme.white);
    else band.stroke({color:Theme.white,width:Math.max(2,thick*.3),alpha:1});
    const offset=thick*.95+g.cell*.025;let dx=0,dy=0;if(port.side==='W')dx=-offset;if(port.side==='E')dx=offset;if(port.side==='N')dy=-offset;if(port.side==='S')dy=offset;
    detail.position.set(dx,dy);
    if(emitter){
      const ang={W:0,E:Math.PI,N:Math.PI/2,S:-Math.PI/2}[port.side];
      const tip=g.cell*.16,base=-g.cell*.09,halfH=g.cell*.115;
      const tri=new Graphics().poly([tip,0,base,-halfH,base,halfH],true).fill(Theme.white);tri.rotation=ang;tri.blendMode='add';
      const white=new Graphics().poly([g.cell*.08,0,-g.cell*.01,-g.cell*.05,-g.cell*.01,g.cell*.05],true).fill(Theme.white);white.rotation=ang;
      detail.addChild(tri,white);
    }else{
      const ring=new Graphics().circle(0,0,g.cell*.105)
        .stroke({color:Theme.white,width:Math.max(2.5,g.cell*.035),alpha:1})
        .circle(0,0,g.cell*.032).fill(Theme.white);ring.blendMode='add';
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
