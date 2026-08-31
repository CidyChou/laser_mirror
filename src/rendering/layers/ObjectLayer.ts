import { Container, FillGradient, Graphics, Rectangle } from 'pixi.js';
import { borderPoint, cellCenter } from '@/gameplay/geometry';
import { combinerNeed, focusNeed, itemKey, levelEmitters } from '@/gameplay/levelAccess';
import type { BoardGeometry, Direction, GameState, LevelItem, Port } from '@/gameplay/types';
import { isLightTheme, Theme } from '../theme';
import { GameConfig } from '@/config/GameConfig';
import { CollectorVisual } from '../effects/CollectorVisual';

type ItemNode={key:string;kind:LevelItem['type'];root:Container;motion:Container;angleCarrier?:Container;face?:Graphics;core?:Graphics;phase:number;lastLit?:boolean;lastOpen?:boolean;lastCharge?:number;pips?:Graphics;collector?:CollectorVisual};
type PortalMotion={flow:Container;mist:Graphics;phase:number};
type Kick={start:number};
type ClickFx={root:Container;ring:Graphics;flash:Graphics;start:number;active:boolean};
type PortNode={port:Port;emitter:boolean;targetIndex?:number;root:Container;halo:Graphics;light:Graphics;core:Graphics;pips:Graphics;required:number;phase:number;active:boolean;lastActive:boolean|null;lastCharge:number};

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
  private readonly finishes=new Map<string,FillGradient>();
  private portals:PortalMotion[]=[];
  private state:GameState|null=null;
  private ambientActive=false;
  private readonly mirrorFinish=new FillGradient({
    start:{x:0,y:0},end:{x:1,y:0},textureSize:128,
    colorStops:[
      {offset:0,color:Theme.mirrorShade},
      {offset:.30,color:Theme.mirrorBlade},
      {offset:.50,color:Theme.mirrorCore},
      {offset:.72,color:Theme.mirrorBlade},
      {offset:1,color:Theme.mirrorEnd},
    ],
  });
  private readonly mirrorSeatFinish=new FillGradient({
    start:{x:0,y:0},end:{x:0,y:1},
    colorStops:[{offset:0,color:Theme.raisedMovable},{offset:1,color:Theme.cellB}],
  });
  private readonly fixedMirrorSeatFinish=new FillGradient({
    start:{x:0,y:0},end:{x:0,y:1},
    colorStops:[{offset:0,color:Theme.raisedFixed},{offset:1,color:Theme.cellB}],
  });

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
    this.state=state;
    if(this.levelIndex!==state.levelIndex){this.levelIndex=state.levelIndex;this.rebuild(state,g);}
    this.refresh(state,g);
  }
  private rebuild(state:GameState,g:BoardGeometry){
    this.portLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.itemLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.itemNodes.clear();this.portNodes=[];this.portals=[];this.kicks.clear();
    levelEmitters(state.level).forEach(port=>{const emitter=this.makePort(port,g,true);this.portNodes.push(emitter);this.portLayer.addChild(emitter.root);});
    state.targets.forEach((t,i)=>{const n=this.makePort(t,g,false,i,t.required);this.portNodes.push(n);this.portLayer.addChild(n.root);});
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
      if(item.type==='combiner'){const charge=state.combinerHits[itemKey(item.x,item.y)]??0;const on=!!state.combinerOn[itemKey(item.x,item.y)];if(n.lastCharge!==charge||n.lastLit!==on){n.lastCharge=charge;n.lastLit=on;n.collector?.setCharge(charge,on);}}
    });
  }

  kick(x:number,y:number,now:number){this.kicks.set(`${x},${y}`,{start:now});}
  rotateFeedback(x:number,y:number,now:number,g:BoardGeometry){const c=cellCenter(g,x,y),fx=this.clickPool.find(v=>!v.active)??this.clickPool[0];fx.active=true;fx.start=now;fx.root.visible=true;fx.root.position.set(c.x,c.y);fx.root.scale.set(.7);fx.root.alpha=1;fx.ring.scale.set(.75);fx.flash.rotation=0;}
  update(now:number,ambient=true){
    this.ambientActive=ambient&&this.portals.length>0;
    if(ambient)for(const portal of this.portals){
      portal.flow.rotation=now*.0007+portal.phase;
      portal.mist.alpha=.48+.18*Math.sin(now*.0017+portal.phase);
      portal.mist.scale.set(1+.055*Math.sin(now*.0011+portal.phase));
    }
    const state=this.state;
    if(state)for(const n of this.itemNodes.values()){
      if(!n.collector)continue;
      const pulse=state.result?.combinerPulses[n.key];
      const travelMs=state.shotElapsedMs-GameConfig.laser.chargeMs;
      const charging=state.firing&&pulse&&n.collector.full&&!state.combinerOn[n.key];
      const progress=charging?Math.max(0,Math.min(1,(travelMs-pulse.readyMs)/GameConfig.laser.combinerChargeMs)):null;
      const releaseAge=state.combinerOn[n.key]&&pulse?travelMs-pulse.launchMs:Infinity;
      n.collector.animate(now,progress,releaseAge);
    }
    for(const port of this.portNodes){
      const breath=.5+.5*Math.sin(now*.0025+port.phase);
      port.halo.alpha=port.active?.28+breath*.07:port.emitter?.14:.14;
      port.light.alpha=port.active?.96:port.emitter?.90:.93;
      port.core.alpha=port.active?.84+breath*.08:.52;
    }
    for(const [key,k] of [...this.kicks]){const n=this.itemNodes.get(key);if(!n){this.kicks.delete(key);continue;}const t=(now-k.start)/280;if(t>=1){n.motion.scale.set(1);n.motion.position.set(0,0);n.motion.rotation=0;this.kicks.delete(key);continue;}const hit=Math.sin(t*Math.PI)*Math.exp(-t*1.55);n.motion.scale.set(1+hit*.12);n.motion.position.set(0,-hit*6);n.motion.rotation=hit*.028*Math.sin(now*.08);}
    for(const fx of this.clickPool){if(!fx.active)continue;const t=(now-fx.start)/300;if(t>=1){fx.active=false;fx.root.visible=false;continue;}const ease=1-Math.pow(1-t,3);fx.root.scale.set(.7+ease*.65);fx.root.alpha=1-t;fx.ring.scale.set(.75+ease*.85);fx.flash.rotation=t*.22;fx.flash.alpha=(1-t)*.62;}
  }
  get active(){return this.ambientActive||this.kicks.size>0||this.clickPool.some(x=>x.active);}

  // Reuse small baked material ramps across every object and state.
  private finish(top:number,bottom:number,horizontal=false){
    const key=`${top}:${bottom}:${horizontal}`;
    let fill=this.finishes.get(key);
    if(!fill){
      fill=new FillGradient({start:{x:0,y:0},end:{x:horizontal?1:0,y:horizontal?0:1},textureSize:64,
        colorStops:[{offset:0,color:top},{offset:1,color:bottom}]});
      this.finishes.set(key,fill);
    }
    return fill;
  }

  private light(g:Graphics,x:number,y:number,rx:number,ry:number,color:number,alpha:number){
    const key=`glow:${color}`;
    let fill=this.finishes.get(key);
    if(!fill){
      const hex=`#${color.toString(16).padStart(6,'0')}`;
      fill=new FillGradient({type:'radial',center:{x:.5,y:.5},outerRadius:.5,textureSize:64,
        colorStops:[{offset:0,color:`${hex}ff`},{offset:.22,color:`${hex}a0`},{offset:.55,color:`${hex}30`},{offset:1,color:`${hex}00`}]});
      this.finishes.set(key,fill);
    }
    g.ellipse(x,y,rx,ry).fill({fill,alpha});
  }

  private blockShadow(g:Graphics,size:number,radius:number,depth:number){
    for(let i=4;i>=1;i--){
      const spread=size*.016*i;
      g.roundRect(-size/2-spread,-size/2+depth-spread,size+spread*2,size+spread*2,radius+spread)
        .fill({color:Theme.shadow,alpha:.035});
    }
  }

  private lockMark(cell:number,y=cell*.27){
    const w=cell*.10,h=cell*.065;
    return new Graphics()
      .roundRect(-w*.32,y-h*.8,w*.64,h,.025*cell).stroke({color:Theme.lock,width:Math.max(1,cell*.015)})
      .roundRect(-w/2,y-h*.15,w,h,cell*.015).fill(Theme.lock);
  }

  private mirrorSeat(cell:number,fixed:boolean){
    const seat=new Graphics(),size=cell*.72,depth=cell*.048,radius=cell*.14;
    // A soft contact shadow and a single bevel keep the support quiet.
    for(let i=5;i>=1;i--){
      const spread=i*cell*.012;
      seat.roundRect(-size/2-spread,-size/2+depth+cell*.045-spread,size+spread*2,size-depth+spread*2,radius+spread)
        .fill({color:Theme.shadow,alpha:.035});
    }
    seat.roundRect(-size/2,-size/2+depth,size,size-depth,radius).fill(Theme.boardBottom);
    seat.roundRect(-size/2,-size/2,size,size-depth,radius)
      .fill(fixed?this.fixedMirrorSeatFinish:this.mirrorSeatFinish)
      .stroke({color:Theme.white,width:1.3,alpha:.085});
    seat.moveTo(-size/2+radius,-size/2+1)
      .lineTo(size/2-radius,-size/2+1)
      .stroke({color:Theme.white,width:1,alpha:.06,cap:'round'});
    return seat;
  }

  private makeItem(item:LevelItem,state:GameState,g:BoardGeometry):ItemNode{
    const root=new Container(),motion=new Container();root.position.copyFrom(cellCenter(g,item.x,item.y));root.addChild(motion);const key=`${item.x},${item.y}`;
    if(item.type==='mirror'){
      root.addChildAt(this.mirrorSeat(g.cell,!!item.fixed),0);
      const carrier=new Container();carrier.position.y=-g.cell*.035;carrier.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      const s=g.cell*.54,thickness=g.cell*.13,radius=thickness*.46;
      const glow=new Graphics();
      for(let i=4;i>=1;i--){
        const spread=i*g.cell*.010;
        glow.roundRect(-s/2-spread,-thickness/2-spread,s+spread*2,thickness+spread*2,radius+spread)
          .fill({color:Theme.cyan,alpha:item.fixed?.010:.018});
      }
      glow.blendMode=this.energyBlend;
      const shadow=new Graphics().roundRect(-s/2+1,-thickness/2+g.cell*.026,s,thickness,radius)
        .fill({color:Theme.shadow,alpha:.30});
      const blade=new Graphics().roundRect(-s/2,-thickness/2,s,thickness,radius)
        .fill(this.mirrorFinish)
        .stroke({color:Theme.white,width:1.35,alpha:.65});
      carrier.addChild(glow,shadow,blade);motion.addChild(carrier);
      if(item.fixed)motion.addChild(this.lockMark(g.cell));
      return{key,kind:item.type,root,motion,angleCarrier:carrier,phase:0};
    }
    if(item.type==='splitter'){
      root.addChildAt(this.mirrorSeat(g.cell,!!item.fixed),0);
      const gem=new Container();gem.position.y=-g.cell*.025;gem.rotation=Math.PI/4;
      const s=g.cell*.43,radius=g.cell*.055;
      const halo=new Graphics();this.light(halo,0,0,s*.8,s*.8,Theme.cyan,.18);halo.blendMode=this.energyBlend;
      const shadow=new Graphics().roundRect(-s/2+1,-s/2+g.cell*.025,s,s,radius).fill({color:Theme.shadow,alpha:.30});
      const crystal=new Graphics().roundRect(-s/2,-s/2,s,s,radius)
        .fill(this.finish(mix(Theme.cyanSoft,Theme.white,.25),mix(Theme.splitterGem,Theme.boardBottom,.28)))
        .stroke({color:Theme.white,width:1.25,alpha:.42});
      // Facets share the crystal silhouette instead of adding an opaque tile.
      crystal.poly([-s*.43,-s*.40,s*.40,-s*.40,-s*.40,s*.40],true).fill({color:Theme.white,alpha:.15});
      crystal.poly([s*.41,-s*.36,s*.41,s*.41,-s*.36,s*.41],true).fill({color:Theme.purple,alpha:.13});
      gem.addChild(halo,shadow,crystal);motion.addChild(gem);
      const dir=new Container();dir.position.y=-g.cell*.025;dir.rotation=item.s===0?Math.PI/4:-Math.PI/4;
      const rail=new Graphics().moveTo(-g.cell*.23,0).lineTo(g.cell*.23,0)
        .stroke({color:Theme.mirrorCore,width:Math.max(1.7,g.cell*.022),alpha:.92,cap:'round'});
      dir.addChild(rail);motion.addChild(dir);
      if(item.fixed)motion.addChild(this.lockMark(g.cell));
      return{key,kind:item.type,root,motion,angleCarrier:dir,phase:0};
    }
    if(item.type==='wall'){
      const s=g.cell*.74,r=g.cell*.11,depth=g.cell*.045;
      const block=new Graphics();this.blockShadow(block,s,r,depth);
      block.roundRect(-s/2,-s/2+depth,s,s,r).fill(Theme.boardBottom);
      block.roundRect(-s/2,-s/2,s,s,r)
        .fill(this.finish(Theme.wallFace,Theme.wallInset))
        .stroke({color:Theme.white,width:1,alpha:.09});
      block.moveTo(-s/2+r,-s/2+1).lineTo(s/2-r,-s/2+1)
        .stroke({color:Theme.white,width:1.2,alpha:.13,cap:'round'});
      motion.addChild(block);return{key,kind:item.type,root,motion,phase:0};
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
      const collector=new CollectorVisual(g.cell,combinerNeed(item));
      collector.direction.rotation=item.dir*Math.PI/2;
      const charge=state.combinerHits[key]??0,on=!!state.combinerOn[key];
      collector.setCharge(charge,on);motion.addChild(collector);
      if(item.fixed){const lock=this.lockMark(g.cell,g.cell*.365);lock.position.x=-g.cell*.20;motion.addChild(lock);}
      return{key,kind:item.type,root,motion,angleCarrier:collector.direction,collector,phase:0,lastCharge:charge,lastLit:on};
    }
    const color=item.pair==='P1'?Theme.purple:Theme.cyan;
    const c=g.cell,portal=new Graphics();
    this.light(portal,0,c*.04,c*.40,c*.29,Theme.shadow,.56);
    portal.ellipse(0,c*.025,c*.30,c*.215).fill(Theme.boardBottom);
    portal.ellipse(0,0,c*.30,c*.215)
      .fill(this.finish(mix(color,Theme.white,.22),mix(color,Theme.boardBottom,.58)));
    portal.ellipse(0,-c*.008,c*.235,c*.155)
      .fill(this.finish(mix(color,Theme.boardBottom,.78),Theme.shadow));
    this.light(portal,0,c*.026,c*.22,c*.12,color,.44);
    // One polished rim and a shaded aperture, without concentric white rings.
    portal.moveTo(-c*.24,-c*.092)
      .bezierCurveTo(-c*.14,-c*.24,c*.15,-c*.24,c*.245,-c*.085)
      .stroke({color:mix(color,Theme.white,.58),width:Math.max(1.2,c*.017),alpha:.8,cap:'round'});
    const orbit=new Container();orbit.position.y=-c*.008;orbit.scale.y=.62;
    const flow=new Container();
    const swirl=new Graphics().arc(0,0,c*.19,-.6,.1).stroke({color:mix(color,Theme.white,.5),width:Math.max(1,c*.014),alpha:.58,cap:'round'})
      .arc(0,0,c*.145,2.1,2.65).stroke({color,width:Math.max(1,c*.012),alpha:.45,cap:'round'});
    for(let i=0;i<2;i++){
      const angle=i*Math.PI+.1,r=c*(i===0?.19:.145);
      swirl.circle(Math.cos(angle)*r,Math.sin(angle)*r,c*.013).fill({color:Theme.white,alpha:.65});
    }
    flow.addChild(swirl);orbit.addChild(flow);
    const mist=new Graphics();this.light(mist,-c*.025,c*.016,c*.21,c*.115,color,.40);
    motion.addChild(portal,mist,orbit);
    this.portals.push({flow,mist,phase:item.x*.9+item.y*.5});
    return{key,kind:item.type,root,motion,phase:0};
  }

  private drawSwitch(n:ItemNode,lit:boolean,g:BoardGeometry){
    if(!n.face||!n.core)return;
    const c=g.cell,r=c*.245,color=lit?Theme.green:Theme.switchOff;
    n.face.clear();
    this.light(n.face,0,c*.025,c*.33,c*.33,lit?Theme.green:Theme.shadow,lit?.18:.4);
    n.face.circle(0,c*.025,r).fill(Theme.boardBottom);
    n.face.circle(0,0,r)
      .fill(this.finish(mix(color,Theme.white,lit?.12:.15),mix(color,Theme.boardBottom,.24)))
      .stroke({color:Theme.white,width:1,alpha:.12});
    // A power mark is a functional glyph, replacing the old bullseye.
    n.core.clear().arc(0,0,c*.092,-Math.PI*.25,Math.PI*1.25)
      .stroke({color:lit?Theme.switchOnRing:Theme.switchOffCore,width:Math.max(1.6,c*.024),alpha:.95,cap:'round'});
    n.core.moveTo(0,-c*.13).lineTo(0,-c*.01)
      .stroke({color:lit?Theme.switchOnRing:Theme.switchOffCore,width:Math.max(1.6,c*.024),cap:'round'});
  }

  private drawDoor(n:ItemNode,open:boolean,g:BoardGeometry){
    if(!n.face)return;
    const c=g.cell,size=c*.68,half=size/2,r=c*.08;
    const face=n.face.clear();
    if(open){
      // The opened center is genuinely empty; light passes between the rails.
      for(const side of [-1,1]){
        const x=side<0?-half:half-c*.09;
        face.roundRect(x,-half,c*.09,size,r*.45).fill(this.finish(Theme.wallFace,Theme.wallInset));
        face.moveTo(side*(half-c*.10),-c*.24).lineTo(side*(half-c*.10),c*.24)
          .stroke({color:Theme.green,width:Math.max(1.5,c*.02),alpha:.72,cap:'round'});
      }
      return;
    }
    this.blockShadow(face,size,r,c*.03);
    face.roundRect(-half,-half+c*.025,size,size,r).fill(Theme.boardBottom);
    const material=this.finish(mix(Theme.doorClosed,Theme.white,.10),mix(Theme.doorClosed,Theme.boardBottom,.42));
    for(const side of [-1,1]){
      const x=side<0?-half:c*.014;
      face.roundRect(x,-half,half-c*.014,size,r).fill(material)
        .stroke({color:Theme.white,width:1,alpha:.08});
    }
    face.moveTo(-c*.014,-c*.23).lineTo(-c*.014,c*.23)
      .stroke({color:Theme.doorEdge,width:Math.max(1.5,c*.02),alpha:.65,cap:'round'});
    face.roundRect(-c*.075,-c*.038,c*.15,c*.076,c*.018)
      .fill(this.finish(Theme.doorEdge,Theme.doorClosed));
  }

  private drawFocus(n:ItemNode,charge:number,need:number,g:BoardGeometry){
    if(!n.face||!n.core)return;
    const on=charge>=need,c=g.cell,r=c*.30,color=on?Theme.green:Theme.gold;
    const hex=(dy:number)=>[0,-r+dy,r*.72,-r*.2+dy,r*.72,r*.2+dy,0,r+dy,-r*.72,r*.2+dy,-r*.72,-r*.2+dy];
    n.face.clear();
    this.light(n.face,0,0,c*.36,c*.38,color,on?.24:.075);
    n.face.poly(hex(c*.027),true).fill(Theme.boardBottom);
    n.face.poly(hex(0),true)
      .fill(this.finish(mix(color,Theme.white,.22),mix(color,Theme.boardBottom,.38)))
      .stroke({color:Theme.white,width:1.2,alpha:.30});
    n.face.poly([0,-r*.9,r*.65,-r*.18,-r*.65,-r*.18],true).fill({color:Theme.white,alpha:.13});
    n.core.clear();
    this.light(n.core,0,0,c*.17,c*.17,color,on?.75:.30);
    n.core.circle(0,0,c*.085).fill(this.finish(Theme.mirrorCore,mix(color,Theme.mirrorCore,.26)));
    this.drawPips(n,charge,need,g,on?Theme.green:Theme.gold);
  }

  private drawPips(n:ItemNode,charge:number,need:number,g:BoardGeometry,color:number){
    if(!n.pips)return;
    n.pips.clear();
    const count=Math.max(2,need),span=g.cell*.27,step=span/count;
    const y=g.cell*(n.kind==='combiner'?.235:.35),height=Math.max(1.8,g.cell*.026);
    for(let i=0;i<count;i++){
      const x=-span/2+step*(i+.5),width=step*.60;
      n.pips.roundRect(x-width/2,y-height/2,width,height,height/2)
        .fill({color,alpha:i<charge?1:.24});
    }
  }

  private makePort(port:Port,g:BoardGeometry,emitter:boolean,targetIndex?:number,required=1):PortNode{
    const root=new Container();root.position.copyFrom(borderPoint(g,port));
    // Local +X always faces into the board, for all four wall orientations.
    root.rotation={W:0,E:Math.PI,N:Math.PI/2,S:-Math.PI/2}[port.side];
    const cell=g.cell,length=cell*.62,width=cell*.105;
    const shell=new Graphics(),halo=new Graphics(),light=new Graphics(),core=new Graphics(),pips=new Graphics();
    shell.roundRect(-width*.62,-length/2+cell*.025,width*1.24,length,width*.52)
      .fill({color:Theme.shadow,alpha:.3});
    shell.roundRect(-width/2,-length/2,width,length,width*.48)
      .fill(this.finish(Theme.mirrorShade,Theme.boardBottom,true))
      .stroke({color:Theme.white,width:1,alpha:.13});
    this.light(halo,0,0,width*2.5,length*.65,Theme.white,1);halo.blendMode=this.energyBlend;
    const lensW=width*(emitter?.55:.70),lensH=length*.86;
    light.roundRect(-lensW/2,-lensH/2,lensW,lensH,lensW*.48)
      .fill(this.finish(Theme.white,0x9faaba,true));
    if(emitter){
      // One solid nozzle carries the direction; no nested arrow outlines.
      light.poly([-cell*.125,-cell*.095,cell*.125,0,-cell*.125,cell*.095],true)
        .fill(this.finish(Theme.white,0x9faaba));
      core.moveTo(-cell*.025,0).lineTo(cell*.06,0)
        .stroke({color:Theme.laserCore,width:Math.max(1.4,cell*.017),cap:'round'});
    }else{
      // A single luminous slot replaces the detached bullseye and its rings.
      core.moveTo(0,-lensH*.32).lineTo(0,lensH*.32)
        .stroke({color:Theme.white,width:Math.max(1,cell*.012),cap:'round'});
    }
    core.blendMode=this.energyBlend;
    root.addChild(halo,shell,light,core,pips);
    return{port,emitter,targetIndex,root,halo,light,core,pips,required:Math.max(1,Math.floor(required)),
      phase:(targetIndex??0)*1.37,active:false,lastActive:null,lastCharge:-1};
  }

  private refreshPort(n:PortNode,state:GameState,g:BoardGeometry){
    n.root.position.copyFrom(borderPoint(g,n.port));
    const target=n.targetIndex===undefined?undefined:state.targets[n.targetIndex];
    const active=n.emitter?state.firing:!!target?.hit;
    const charge=target?.charge??0;
    n.active=active;
    if(n.lastActive===active&&n.lastCharge===charge)return;
    n.lastActive=active;n.lastCharge=charge;
    const idleGold=isLightTheme()?mix(Theme.gold,0xffdb58,.68):mix(Theme.gold,Theme.white,.10);
    const color=n.emitter?Theme.laserBody:active?Theme.green:idleGold;
    n.halo.tint=color;n.light.tint=color;
    n.core.visible=n.emitter||(active&&n.required===1);
    n.pips.clear();
    // Ordinary targets have no extra ornament. Multi-hit targets retain only
    // the necessary charge marks, integrated into the receiving window.
    if(n.required>1){
      const cell=g.cell,span=cell*.35,step=span/n.required;
      for(let i=0;i<n.required;i++){
        const y=-span/2+step*(i+.5);
        n.pips.roundRect(-cell*.017,y-step*.26,cell*.034,step*.52,cell*.008)
          .fill({color:i<charge?Theme.white:Theme.shadow,alpha:i<charge?.92:.52});
      }
    }
  }

  override destroy(options?:Parameters<Container['destroy']>[0]){
    super.destroy(options);
    this.mirrorFinish.destroy();
    this.mirrorSeatFinish.destroy();
    this.fixedMirrorSeatFinish.destroy();
    for(const finish of this.finishes.values())finish.destroy();
    this.finishes.clear();
  }
}

function mix(a:number,b:number,t:number){
  const channel=(shift:number)=>Math.round(((a>>shift)&255)*(1-t)+((b>>shift)&255)*t);
  return (channel(16)<<16)|(channel(8)<<8)|channel(0);
}
