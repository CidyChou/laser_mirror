import { Container, Graphics } from 'pixi.js';
import { borderPoint, cellCenter } from '@/gameplay/geometry';
import type { BoardGeometry, GameState, LevelItem, Port } from '@/gameplay/types';
import { Theme } from '../theme';

type ItemNode={key:string;kind:LevelItem['type'];root:Container;motion:Container;angleCarrier?:Container;face?:Graphics;core?:Graphics;phase:number};
type Kick={start:number};
type ClickFx={root:Container;ring:Graphics;flash:Graphics;start:number;active:boolean};
type PortNode={port:Port;emitter:boolean;targetIndex?:number;root:Container;band:Graphics;detail:Container;phase:number};

export class ObjectLayer extends Container{
  private portLayer=new Container();
  private itemLayer=new Container();
  private feedbackLayer=new Container();
  private itemNodes=new Map<string,ItemNode>();
  private portNodes:PortNode[]=[];
  private kicks=new Map<string,Kick>();
  private clickPool:ClickFx[]=[];
  private rotateHandler:(x:number,y:number)=>void=()=>{};
  private layoutSignature='';

  constructor(){
    super();this.addChild(this.portLayer,this.itemLayer,this.feedbackLayer);
    for(let i=0;i<12;i++){
      const root=new Container();root.visible=false;
      const ring=new Graphics().circle(0,0,20).stroke({color:Theme.cyan,width:2.4,alpha:.72}); ring.blendMode='add';
      const flash=new Graphics().moveTo(-17,0).lineTo(17,0).stroke({color:0xffffff,width:1.5,alpha:.68}).moveTo(0,-17).lineTo(0,17).stroke({color:Theme.cyanSoft,width:1.4,alpha:.58}); flash.blendMode='add';
      root.addChild(ring,flash);this.feedbackLayer.addChild(root);this.clickPool.push({root,ring,flash,start:0,active:false});
    }
  }
  setRotateHandler(fn:(x:number,y:number)=>void){this.rotateHandler=fn;}

  sync(state:GameState,g:BoardGeometry){
    const signature=JSON.stringify({rows:state.level.rows,cols:state.level.cols,emitter:state.level.emitter,targets:state.level.targets,items:state.level.items.map(i=>({type:i.type,x:i.x,y:i.y,fixed:'fixed'in i?!!i.fixed:false,id:'id'in i?i.id:undefined,pair:'pair'in i?i.pair:undefined,requires:'requires'in i?i.requires:undefined}))});
    if(signature!==this.layoutSignature){this.layoutSignature=signature;this.rebuild(state,g);}this.refresh(state,g);
  }
  private rebuild(state:GameState,g:BoardGeometry){
    this.portLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.itemLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.itemNodes.clear();this.portNodes=[];
    const emitter=this.makePort(state.level.emitter,g,true);this.portNodes.push(emitter);this.portLayer.addChild(emitter.root);
    state.targets.forEach((t,i)=>{const n=this.makePort(t,g,false,i);this.portNodes.push(n);this.portLayer.addChild(n.root);});
    for(const item of state.items){const n=this.makeItem(item,state,g);this.itemLayer.addChild(n.root);this.itemNodes.set(n.key,n);if((item.type==='mirror'||item.type==='splitter')&&!item.fixed){n.root.eventMode='static';n.root.cursor='pointer';n.root.on('pointertap',()=>this.rotateHandler(item.x,item.y));}}
  }
  private refresh(state:GameState,g:BoardGeometry){
    this.portNodes.forEach(n=>this.refreshPort(n,state,g));
    state.items.forEach(item=>{const n=this.itemNodes.get(`${item.x},${item.y}`);if(!n)return;n.root.position.copyFrom(cellCenter(g,item.x,item.y));if((item.type==='mirror'||item.type==='splitter')&&n.angleCarrier)n.angleCarrier.rotation=item.s===0?Math.PI/4:-Math.PI/4;if(item.type==='switch')this.drawSwitch(n,state.activeSwitches.has(item.id),g);if(item.type==='door')this.drawDoor(n,!!state.activeDoorStates[item.id],g);});
  }

  kick(x:number,y:number,now:number){this.kicks.set(`${x},${y}`,{start:now});}
  rotateFeedback(x:number,y:number,now:number,g:BoardGeometry){const c=cellCenter(g,x,y),fx=this.clickPool.find(v=>!v.active)??this.clickPool[0];fx.active=true;fx.start=now;fx.root.visible=true;fx.root.position.set(c.x,c.y);fx.root.scale.set(.7);fx.root.alpha=1;fx.ring.scale.set(.75);fx.flash.rotation=0;}
  update(now:number){
    for(const [key,k] of [...this.kicks]){const n=this.itemNodes.get(key);if(!n){this.kicks.delete(key);continue;}const t=(now-k.start)/260;if(t>=1){n.motion.scale.set(1);n.motion.position.set(0,0);n.motion.rotation=0;this.kicks.delete(key);continue;}const hit=Math.sin(t*Math.PI)*Math.exp(-t*1.8);n.motion.scale.set(1+hit*.08);n.motion.position.set(0,-hit*4);n.motion.rotation=hit*.018*Math.sin(now*.08);}
    for(const fx of this.clickPool){if(!fx.active)continue;const t=(now-fx.start)/300;if(t>=1){fx.active=false;fx.root.visible=false;continue;}const ease=1-Math.pow(1-t,3);fx.root.scale.set(.7+ease*.65);fx.root.alpha=1-t;fx.ring.scale.set(.75+ease*.85);fx.flash.rotation=t*.22;fx.flash.alpha=(1-t)*.62;}
  }
  get active(){return this.kicks.size>0||this.clickPool.some(x=>x.active);}

  private makeRaisedBase(g:BoardGeometry,top:number){
    const c=new Container(),s=g.cell*.70,d=Math.max(4,g.cell*.05),r=g.cell*.135;
    const shadow=new Graphics().roundRect(-s/2+1,-s/2+d+4,s,s-d,r).fill({color:Theme.shadow,alpha:.34});
    const base=new Graphics().roundRect(-s/2,-s/2,s,s-d,r).fill(top).stroke({color:0xffffff,width:1.2,alpha:.08});
    const rim=new Graphics().roundRect(-s/2+2,-s/2+2,s-4,s-d-4,r*.82).stroke({color:0xffffff,width:1,alpha:.045});
    const sheen=new Graphics().roundRect(-s/2+6,-s/2+6,s-12,(s-d)*.26,r*.65).fill({color:0xffffff,alpha:.028});
    c.addChild(shadow,base,rim,sheen);return c;
  }

  private makeItem(item:LevelItem,state:GameState,g:BoardGeometry):ItemNode{
    const root=new Container(),motion=new Container();root.position.copyFrom(cellCenter(g,item.x,item.y));root.addChild(motion);const key=`${item.x},${item.y}`;
    if(item.type==='mirror'){
      motion.addChild(this.makeRaisedBase(g,item.fixed?0x314158:0x2d3d56));
      const carrier=new Container();carrier.position.y=-g.cell*.02;carrier.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      const s=g.cell*.50;
      const glow=new Graphics().roundRect(-s*.50,-g.cell*.084,s,g.cell*.168,10).fill({color:Theme.cyan,alpha:.08});glow.blendMode='add';
      const blade=new Graphics().roundRect(-s/2,-g.cell*.062,s,g.cell*.124,9).fill(0xa9c9e1).stroke({color:0xffffff,width:1.2,alpha:.55});
      const hot=new Graphics().roundRect(-s*.28,-g.cell*.038,s*.56,g.cell*.076,6).fill({color:0xf9fdff,alpha:.88});
      const sheen=new Graphics().moveTo(-s*.23,-g.cell*.012).lineTo(s*.18,-g.cell*.012).stroke({color:0xffffff,width:1.7,alpha:.62});
      carrier.addChild(glow,blade,hot,sheen);motion.addChild(carrier);
      if(item.fixed){const lock=new Graphics().roundRect(-10,g.cell*.18,20,12,4).fill(0x8b96aa).roundRect(-3,g.cell*.22,6,8,2).fill(0x111927);motion.addChild(lock);}
      return{key,kind:item.type,root,motion,angleCarrier:carrier,phase:0};
    }
    if(item.type==='splitter'){
      motion.addChild(this.makeRaisedBase(g,item.fixed?0x304257:0x2d4055));
      const gem=new Container();gem.position.y=-g.cell*.018;gem.rotation=Math.PI/4;
      const s=g.cell*.34;
      const halo=new Graphics().roundRect(-s*.60,-s*.60,s*1.2,s*1.2,10).fill({color:Theme.cyan,alpha:.07});halo.blendMode='add';
      const tile=new Graphics().roundRect(-s/2,-s/2,s,s,8).fill(0x79d2e9).stroke({color:0xffffff,width:1.6,alpha:.68});
      const center=new Graphics().roundRect(-s*.17,-s*.17,s*.34,s*.34,4).fill({color:0xf7fdff,alpha:.18});
      gem.addChild(halo,tile,center);motion.addChild(gem);
      const dir=new Container();dir.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      const railGlow=new Graphics().moveTo(-g.cell*.20,0).lineTo(g.cell*.20,0).stroke({color:Theme.cyan,width:4.8,alpha:.14});railGlow.blendMode='add';
      const rail=new Graphics().moveTo(-g.cell*.19,0).lineTo(g.cell*.19,0).stroke({color:0xffffff,width:2.4,alpha:.88});
      dir.addChild(railGlow,rail);motion.addChild(dir);
      return{key,kind:item.type,root,motion,angleCarrier:dir,phase:0};
    }
    if(item.type==='wall'){
      const s=g.cell*.76,d=g.cell*.12;const sh=new Graphics().roundRect(-s/2+2,-s/2+d+7,s,s-d,g.cell*.12).fill({color:Theme.shadow,alpha:.42});const q=new Graphics().roundRect(-s/2,-s/2,s,s-d,g.cell*.12).fill(0x43536e).stroke({color:0xffffff,width:1,alpha:.08}).roundRect(-s/2+2,g.cell*.02,s-4,s*.31,g.cell*.08).fill({color:0x26344a,alpha:.45});motion.addChild(sh,q);return{key,kind:item.type,root,motion,phase:0};
    }
    if(item.type==='switch'){
      const face=new Graphics(),core=new Graphics();motion.addChild(face,core);const n={key,kind:item.type,root,motion,face,core,phase:0};this.drawSwitch(n,state.activeSwitches.has(item.id),g);return n;
    }
    if(item.type==='door'){
      const face=new Graphics();motion.addChild(face);const n={key,kind:item.type,root,motion,face,phase:0};this.drawDoor(n,!!state.activeDoorStates[item.id],g);return n;
    }
    const col=item.pair==='P1'?Theme.purple:Theme.cyan;const portal=new Graphics().ellipse(0,0,g.cell*.24,g.cell*.17).stroke({color:col,width:5,alpha:1}).ellipse(0,0,g.cell*.15,g.cell*.10).stroke({color:0xffffff,width:1.5,alpha:.65});portal.blendMode='add';motion.addChild(portal);return{key,kind:item.type,root,motion,phase:0};
  }

  private drawSwitch(n:ItemNode,lit:boolean,g:BoardGeometry){if(!n.face||!n.core)return;n.face.clear().circle(0,0,g.cell*.20).fill(lit?Theme.green:0x25364d).circle(0,0,g.cell*.27).stroke({color:lit?0xd9fff0:0x68809e,width:3,alpha:1});n.core.clear().circle(0,0,g.cell*.055).fill(lit?0xffffff:0x7f93ad);}
  private drawDoor(n:ItemNode,open:boolean,g:BoardGeometry){if(!n.face)return;n.face.clear();if(open){n.face.roundRect(-g.cell*.34,-g.cell*.34,g.cell*.68,g.cell*.68,10).stroke({color:Theme.cyan,width:3,alpha:.28}).rect(-g.cell*.22,-2,g.cell*.44,4).fill({color:Theme.cyan,alpha:.50});}else{n.face.roundRect(-g.cell*.34,-g.cell*.34,g.cell*.68,g.cell*.68,10).fill(0x78445d).stroke({color:0xff7a9d,width:2,alpha:.70});for(let i=-1;i<=1;i++)n.face.moveTo(i*g.cell*.14,-g.cell*.24).lineTo(i*g.cell*.14,g.cell*.24).stroke({color:0xffcad7,width:3,alpha:.55});}}

  private makePort(port:Port,g:BoardGeometry,emitter:boolean,targetIndex?:number){const root=new Container();root.position.copyFrom(borderPoint(g,port));const band=new Graphics(),detail=new Container();root.addChild(band,detail);return{port,emitter,targetIndex,root,band,detail,phase:0};}
  private refreshPort(n:PortNode,state:GameState,g:BoardGeometry){
    n.root.position.copyFrom(borderPoint(g,n.port));const active=!n.emitter&&n.targetIndex!==undefined?!!state.targets[n.targetIndex]?.hit:false;const color=n.emitter?Theme.beam:active?Theme.green:Theme.gold;const long=g.cell*.56,thick=Math.max(10,g.wall*.65);n.band.clear();
    if(n.port.side==='W'||n.port.side==='E'){const x=n.port.side==='W'?-thick*.45:-thick*.55;n.band.roundRect(x,-long/2,thick,long,6);}
    else{const y=n.port.side==='N'?-thick*.45:-thick*.55;n.band.roundRect(-long/2,y,long,thick,6);}
    if(n.emitter)n.band.fill(color);else n.band.stroke({color,width:3,alpha:1});
    n.detail.removeChildren().forEach(c=>c.destroy({children:true}));
    const offset=9;let dx=0,dy=0;if(n.port.side==='W')dx=-offset;if(n.port.side==='E')dx=offset;if(n.port.side==='N')dy=-offset;if(n.port.side==='S')dy=offset;
    if(n.emitter){const ang={W:0,E:Math.PI,N:Math.PI/2,S:-Math.PI/2}[n.port.side];const tri=new Graphics().poly([18,0,-11,-14,-11,14],true).fill(color);tri.rotation=ang;const white=new Graphics().poly([9,0,-1,-6,-1,6],true).fill(0xffffff);white.rotation=ang;tri.blendMode='add';n.detail.position.set(dx,dy);n.detail.addChild(tri,white);}else{n.detail.position.set(dx,dy);const ring=new Graphics().circle(0,0,11).stroke({color,width:4,alpha:1}).circle(0,0,3.5).fill(color);ring.blendMode='add';n.detail.addChild(ring);}
  }
}
