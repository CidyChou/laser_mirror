import { Container, Graphics, Rectangle } from 'pixi.js';
import { borderPoint, cellCenter } from '@/gameplay/geometry';
import { combinerNeed, focusNeed, itemKey, levelEmitters } from '@/gameplay/levelAccess';
import type { BoardGeometry, Direction, GameState, LevelItem, Port } from '@/gameplay/types';
import { isLightTheme, Theme } from '../theme';

type ItemNode={key:string;kind:LevelItem['type'];root:Container;motion:Container;angleCarrier?:Container;face?:Graphics;core?:Graphics;phase:number;lastLit?:boolean;lastOpen?:boolean;lastCharge?:number;pips?:Graphics};
type Kick={start:number};
type ClickFx={root:Container;ring:Graphics;flash:Graphics;start:number;active:boolean};
type PortNode={port:Port;emitter:boolean;targetIndex?:number;root:Container;halo:Graphics;band:Graphics;plasma:Graphics;core:Graphics;detail:Container;toneParts:Graphics[];hotParts:Graphics[];phase:number;active:boolean;lastActive:boolean|null};

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
  private readonly energyBlend=isLightTheme()?'normal':'add';

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

  rotateItem(x:number,y:number,s:0|1,dir?:Direction){
    const n=this.itemNodes.get(`${x},${y}`);
    if(!n?.angleCarrier) return;
    if(n.kind==='combiner' && dir!==undefined) n.angleCarrier.rotation=dir*Math.PI/2;
    else n.angleCarrier.rotation=s===0?Math.PI/4:-Math.PI/4;
  }

  sync(state:GameState,g:BoardGeometry){
    if(this.levelIndex!==state.levelIndex){this.levelIndex=state.levelIndex;this.rebuild(state,g);}
    this.refresh(state,g);
  }
  private rebuild(state:GameState,g:BoardGeometry){
    this.portLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.itemLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.itemNodes.clear();this.portNodes=[];
    levelEmitters(state.level).forEach(port=>{const emitter=this.makePort(port,g,true);this.portNodes.push(emitter);this.portLayer.addChild(emitter.root);});
    state.targets.forEach((t,i)=>{const n=this.makePort(t,g,false,i);this.portNodes.push(n);this.portLayer.addChild(n.root);});
    for(const item of state.items){const n=this.makeItem(item,state,g);this.itemLayer.addChild(n.root);this.itemNodes.set(n.key,n);if((item.type==='mirror'||item.type==='splitter'||item.type==='combiner')&&!item.fixed){n.root.eventMode='static';n.root.cursor='pointer';n.root.hitArea=new Rectangle(-g.cell*.43,-g.cell*.43,g.cell*.86,g.cell*.86);n.root.on('pointertap',()=>this.rotateHandler(item.x,item.y));}}
  }
  private refresh(state:GameState,g:BoardGeometry){
    this.portNodes.forEach(n=>this.refreshPort(n,state,g));
    state.items.forEach(item=>{
      const n=this.itemNodes.get(`${item.x},${item.y}`);if(!n)return;
      n.root.position.copyFrom(cellCenter(g,item.x,item.y));
      if((item.type==='mirror'||item.type==='splitter')&&n.angleCarrier)n.angleCarrier.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      if(item.type==='combiner'&&n.angleCarrier)n.angleCarrier.rotation=item.dir*Math.PI/2;
      if(item.type==='switch'){const lit=state.activeSwitches.has(item.id);if(n.lastLit!==lit){n.lastLit=lit;this.drawSwitch(n,lit,g);}}
      if(item.type==='door'){const open=!!state.activeDoorStates[item.id];if(n.lastOpen!==open){n.lastOpen=open;this.drawDoor(n,open,g);}}
      if(item.type==='focus'){const charge=state.focusHits[itemKey(item.x,item.y)]??0;const on=charge>=focusNeed(item);if(n.lastCharge!==charge||n.lastLit!==on){n.lastCharge=charge;n.lastLit=on;this.drawFocus(n,charge,focusNeed(item),g);}}
      if(item.type==='combiner'){const charge=state.combinerHits[itemKey(item.x,item.y)]??0;const on=!!state.combinerOn[itemKey(item.x,item.y)]||charge>=combinerNeed(item);if(n.lastCharge!==charge||n.lastLit!==on){n.lastCharge=charge;n.lastLit=on;this.drawCombinerFace(n,charge,combinerNeed(item),on,g);}}
    });
  }

  kick(x:number,y:number,now:number){this.kicks.set(`${x},${y}`,{start:now});}
  rotateFeedback(x:number,y:number,now:number,g:BoardGeometry){const c=cellCenter(g,x,y),fx=this.clickPool.find(v=>!v.active)??this.clickPool[0];fx.active=true;fx.start=now;fx.root.visible=true;fx.root.position.set(c.x,c.y);fx.root.scale.set(.7);fx.root.alpha=1;fx.ring.scale.set(.75);fx.flash.rotation=0;}
  update(now:number){
    for(const port of this.portNodes){
      const breath=.5+.5*Math.sin(now*.00315+port.phase);
      const haloBase=port.emitter?.085:port.active?.13:.045;
      const haloRange=port.emitter?.075:port.active?.085:.045;
      port.halo.alpha=haloBase+breath*haloRange;
      port.halo.scale.set(1+breath*(port.active?.035:.022));
      port.plasma.alpha=(port.emitter?.68:port.active?.76:.54)+breath*.16;
      port.core.alpha=(port.emitter?.82:port.active?.90:.62)+breath*.10;
      port.detail.scale.set(1+breath*(port.active?.035:.018));
    }
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
    if(item.type==='focus'){
      const face=new Graphics(),core=new Graphics(),pips=new Graphics();motion.addChild(face,core,pips);
      const charge=state.focusHits[itemKey(item.x,item.y)]??0;const need=focusNeed(item);
      const n={key,kind:item.type,root,motion,face,core,pips,phase:0,lastCharge:charge,lastLit:charge>=need};
      this.drawFocus(n,charge,need,g);return n;
    }
    if(item.type==='combiner'){
      const face=new Graphics(),core=new Graphics(),pips=new Graphics();
      const carrier=new Container();carrier.rotation=item.dir*Math.PI/2;
      const chevron=new Graphics();
      const tip=g.cell*.22,base=-g.cell*.04,half=g.cell*.11;
      chevron.poly([tip,0,base,-half,base,half],true).fill({color:Theme.white,alpha:.92});
      carrier.addChild(chevron);
      motion.addChild(face,core,pips,carrier);
      const charge=state.combinerHits[itemKey(item.x,item.y)]??0;const need=combinerNeed(item);
      const on=!!state.combinerOn[itemKey(item.x,item.y)]||charge>=need;
      const n={key,kind:item.type,root,motion,angleCarrier:carrier,face,core,pips,phase:0,lastCharge:charge,lastLit:on};
      this.drawCombinerFace(n,charge,need,on,g);
      if(item.fixed){const lock=new Graphics().roundRect(-9,g.cell*.225,18,11,4).fill(Theme.lock).roundRect(-3,g.cell*.255,6,7,2).fill(Theme.lockKey);motion.addChild(lock);}
      return n;
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
  private drawFocus(n:ItemNode,charge:number,need:number,g:BoardGeometry){
    if(!n.face||!n.core)return;
    const on=charge>=need;
    const r=g.cell*.30;
    n.face.clear()
      .poly([0,-r,r*.72,-r*.2,r*.72,r*.2,0,r,-r*.72,r*.2,-r*.72,-r*.2],true)
      .fill(on?Theme.green:Theme.gold)
      .stroke({color:Theme.white,width:1.6,alpha:on?.78:.42});
    n.core.clear().circle(0,0,g.cell*.07).fill({color:Theme.white,alpha:on?.94:.55});
    this.drawPips(n,charge,need,g,on?Theme.white:Theme.shadow);
  }
  private drawCombinerFace(n:ItemNode,charge:number,need:number,on:boolean,g:BoardGeometry){
    if(!n.face||!n.core)return;
    const s=g.cell*.52;
    n.face.clear().roundRect(-s/2,-s/2,s,s,g.cell*.16)
      .fill(on?Theme.purple:Theme.switchOff)
      .stroke({color:on?Theme.cyanSoft:Theme.cyan,width:2.1,alpha:on?.9:.55});
    n.core.clear().circle(0,0,g.cell*.08).fill({color:Theme.white,alpha:on?.9:.4});
    this.drawPips(n,charge,need,g,on?Theme.white:Theme.cyanSoft);
  }
  private drawPips(n:ItemNode,charge:number,need:number,g:BoardGeometry,color:number){
    if(!n.pips)return;
    n.pips.clear();
    const count=Math.max(2,Math.min(4,need));
    const span=g.cell*.20;
    const y=g.cell*.28;
    for(let i=0;i<count;i++){
      const x=-span/2+ (count===1?0:span*(i/(count-1)));
      n.pips.circle(x,y,Math.max(2.4,g.cell*.035)).fill({color,alpha:i<charge?1:.28});
    }
  }

  private makePort(port:Port,g:BoardGeometry,emitter:boolean,targetIndex?:number){
    const root=new Container();root.position.copyFrom(borderPoint(g,port));
    const halo=new Graphics(),band=new Graphics(),plasma=new Graphics(),core=new Graphics(),detail=new Container();
    const toneParts:Graphics[]=[];const hotParts:Graphics[]=[];
    const long=g.cell*.92;
    const thick=Math.max(6,g.cell*.0825);
    const radius=thick*.48;
    const vertical=port.side==='W'||port.side==='E';
    if(vertical){
      halo.roundRect(-thick*1.35,-long*.53,thick*2.7,long*1.06,thick*1.2);
      band.roundRect(-thick/2,-long/2,thick,long,radius);
      plasma.roundRect(-thick*.25,-long*.46,thick*.5,long*.92,thick*.24);
      core.roundRect(-Math.max(.9,thick*.075),-long*.36,Math.max(1.8,thick*.15),long*.72,thick*.08);
    }else{
      halo.roundRect(-long*.53,-thick*1.35,long*1.06,thick*2.7,thick*1.2);
      band.roundRect(-long/2,-thick/2,long,thick,radius);
      plasma.roundRect(-long*.46,-thick*.25,long*.92,thick*.5,thick*.24);
      core.roundRect(-long*.36,-Math.max(.9,thick*.075),long*.72,Math.max(1.8,thick*.15),thick*.08);
    }
    halo.fill({color:Theme.white,alpha:1});halo.blendMode=this.energyBlend;
    halo.alpha=emitter?.12:.06;
    if(emitter)band.fill({color:Theme.white,alpha:.94});
    else band.stroke({color:Theme.white,width:Math.max(2,thick*.28),alpha:.88});
    plasma.fill({color:Theme.white,alpha:1});plasma.blendMode=this.energyBlend;
    plasma.alpha=emitter?.76:.62;
    core.fill({color:Theme.white,alpha:1});core.blendMode=this.energyBlend;
    core.alpha=emitter?.90:.72;
    const offset=thick*.95+g.cell*.025;let dx=0,dy=0;if(port.side==='W')dx=-offset;if(port.side==='E')dx=offset;if(port.side==='N')dy=-offset;if(port.side==='S')dy=offset;
    detail.position.set(dx,dy);
    if(emitter){
      const ang={W:0,E:Math.PI,N:Math.PI/2,S:-Math.PI/2}[port.side];
      const tip=g.cell*.16,base=-g.cell*.09,halfH=g.cell*.115;
      const marker=new Container();marker.rotation=ang;
      const markerHalo=new Graphics().poly([tip*1.25,0,base*1.15,-halfH*1.25,base*1.15,halfH*1.25],true).fill({color:Theme.white,alpha:.14});markerHalo.blendMode=this.energyBlend;
      const markerBody=new Graphics().poly([tip,0,base,-halfH,base,halfH],true).fill({color:Theme.white,alpha:.96});markerBody.blendMode=this.energyBlend;
      const markerPlasma=new Graphics().poly([tip*.68,0,base*.18,-halfH*.48,base*.18,halfH*.48],true).fill({color:Theme.white,alpha:.92});markerPlasma.blendMode=this.energyBlend;
      const markerCore=new Graphics().moveTo(base*.05,0).lineTo(tip*.54,0).stroke({color:Theme.white,width:Math.max(1.5,g.cell*.022),alpha:.96,cap:'round'});markerCore.blendMode=this.energyBlend;
      marker.addChild(markerHalo,markerBody,markerPlasma,markerCore);detail.addChild(marker);
      toneParts.push(markerHalo,markerBody);hotParts.push(markerPlasma);
    }else{
      const receiverHalo=new Graphics().circle(0,0,g.cell*.16).fill({color:Theme.white,alpha:.12});receiverHalo.blendMode=this.energyBlend;
      const receiverBody=new Graphics().circle(0,0,g.cell*.108).stroke({color:Theme.white,width:Math.max(2.5,g.cell*.035),alpha:.94});receiverBody.blendMode=this.energyBlend;
      const receiverPlasma=new Graphics().circle(0,0,g.cell*.068).stroke({color:Theme.white,width:Math.max(1.6,g.cell*.018),alpha:.78});receiverPlasma.blendMode=this.energyBlend;
      const receiverCore=new Graphics().circle(0,0,g.cell*.027).fill({color:Theme.white,alpha:1});receiverCore.blendMode=this.energyBlend;
      detail.addChild(receiverHalo,receiverBody,receiverPlasma,receiverCore);
      toneParts.push(receiverHalo,receiverBody);hotParts.push(receiverPlasma);
    }
    root.addChild(halo,band,plasma,core,detail);
    const phase=(targetIndex??0)*1.37+({W:.2,E:1.1,N:2.05,S:2.8}[port.side]);
    return{port,emitter,targetIndex,root,halo,band,plasma,core,detail,toneParts,hotParts,phase,active:false,lastActive:null as boolean|null};
  }
  private refreshPort(n:PortNode,state:GameState,_g:BoardGeometry){
    n.root.position.copyFrom(borderPoint(_g,n.port));
    const active=!n.emitter&&n.targetIndex!==undefined?!!state.targets[n.targetIndex]?.hit:false;
    n.active=active;
    if(n.lastActive===active) return;
    n.lastActive=active;
    const color=n.emitter?Theme.beam:active?Theme.green:Theme.gold;
    const hot=n.emitter?Theme.beamHot:active?Theme.switchOnRing:Theme.coinHighlight;
    n.halo.tint=color;
    n.band.tint=color;
    n.plasma.tint=hot;
    for(const part of n.toneParts)part.tint=color;
    for(const part of n.hotParts)part.tint=hot;
  }
}
