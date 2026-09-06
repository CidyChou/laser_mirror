import { Container, FillGradient, Graphics, Rectangle, Text } from 'pixi.js';
import { borderPoint, cellCenter } from '@/gameplay/geometry';
import { combinerNeed, focusNeed, itemKey, levelEmitters } from '@/gameplay/levelAccess';
import type { BoardGeometry, Direction, GameState, LevelItem, Port } from '@/gameplay/types';
import { isLightTheme, Theme, uiText } from '../theme';
import { GameConfig } from '@/config/GameConfig';
import { CollectorVisual } from '../effects/CollectorVisual';
import { mechanismIdentities, type MechanismIdentity } from '../mechanismIdentity';
import { laserMsAtDistance } from '@/gameplay/laserTiming';

type ItemNode={key:string;kind:LevelItem['type'];root:Container;motion:Container;angleCarrier?:Container;face?:Graphics;core?:Graphics;phase:number;lastLit?:boolean;lastOpen?:boolean;lastCharge?:number;pips?:Graphics;collector?:CollectorVisual;identity?:MechanismIdentity;counter?:Text;panels?:Container[];doorId?:string;badges?:{id:string;root:Container;check:Graphics}[]};
type SignalLink={id:string;root:Container;dot:Graphics;from:{x:number;y:number};to:{x:number;y:number};bend:{x:number;y:number}};
type PortalMotion={flow:Container;mist:Graphics;phase:number};
type Kick={start:number};
type ClickFx={root:Container;ring:Graphics;flash:Graphics;start:number;active:boolean};
type PortNode={port:Port;emitter:boolean;targetIndex?:number;root:Container;halo:Graphics;light:Graphics;core:Graphics;pips:Graphics;required:number;phase:number;active:boolean;lastActive:boolean|null;lastCharge:number};

export class ObjectLayer extends Container{
  readonly captions=new Container();
  private portLayer=new Container();
  private itemLayer=new Container();
  private signalLayer=new Container();
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
  private identities=new Map<string,MechanismIdentity>();
  private portalIdentities=new Map<string,MechanismIdentity>();
  private signals:SignalLink[]=[];
  private trace:GameState['result']=null;
  private switchTimes=new Map<string,number>();
  private doorTimes=new Map<string,number>();
  private signalActive=false;
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
    super();this.addChild(this.portLayer,this.signalLayer,this.itemLayer,this.feedbackLayer);
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
    this.captions.eventMode='none';
    this.captions.removeChildren().forEach(c=>c.destroy({children:true}));
    this.identities=mechanismIdentities(state.items,'switch');
    this.portalIdentities=mechanismIdentities(state.items,'portal');
    this.signalLayer.removeChildren().forEach(c=>c.destroy({children:true}));this.signals=[];
    this.makeSignals(state,g);
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
      if(item.type==='door'){
        n.lastOpen=!!state.activeDoorStates[item.id];
      }
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
    this.signalActive=false;
    if(state){
      if(this.trace!==state.result){
        this.trace=state.result;this.switchTimes.clear();this.doorTimes.clear();
        for(const e of state.result?.impactEvents??[]){
          if(e.type==='switch'&&e.id&&!this.switchTimes.has(e.id))this.switchTimes.set(e.id,laserMsAtDistance(e.at));
          if(e.type==='door-open'&&e.id)this.doorTimes.set(e.id,laserMsAtDistance(e.at));
        }
      }
      const travel=state.shotElapsedMs-GameConfig.laser.chargeMs;
      for(const link of this.signals){
        const start=this.switchTimes.get(link.id),age=start===undefined?-1:travel-start;
        link.root.visible=age>=0&&age<GameConfig.laser.doorSignalMs+GameConfig.laser.doorOpenMs;
        if(!link.root.visible)continue;
        this.signalActive=true;
        const t=Math.min(1,age/GameConfig.laser.doorSignalMs),inv=1-t;
        link.dot.position.set(inv*inv*link.from.x+2*inv*t*link.bend.x+t*t*link.to.x,inv*inv*link.from.y+2*inv*t*link.bend.y+t*t*link.to.y);
        link.root.alpha=t<1?1:Math.max(0,1-(age-GameConfig.laser.doorSignalMs)/GameConfig.laser.doorOpenMs);
      }
      for(const n of this.itemNodes.values()){
        if(!n.panels)continue;
        for(const badge of n.badges??[]){
          const sent=this.switchTimes.get(badge.id),arrived=sent!==undefined&&travel>=sent+GameConfig.laser.doorSignalMs;
          badge.check.visible=arrived;badge.root.alpha=arrived?1:.85;
        }
        const end=this.doorTimes.get(n.doorId!);
        const t=n.lastOpen?1:end===undefined?0:Math.max(0,Math.min(1,(travel-end+GameConfig.laser.doorOpenMs)/GameConfig.laser.doorOpenMs));
        const ease=t*t*(3-2*t);
        for(const panel of n.panels)panel.scale.x=1-ease*.88;
        if(t>0&&t<1)this.signalActive=true;
      }
    }
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
  get active(){return this.ambientActive||this.signalActive||this.kicks.size>0||this.clickPool.some(x=>x.active);}

  portalColor(pair:string){return this.portalIdentities.get(pair)?.color??Theme.purple;}
  focusColor(x?:number,y?:number){return this.itemNodes.get(`${x},${y}`)?.lastLit?Theme.green:Theme.gold;}

  private badge(identity:MechanismIdentity,cell:number){
    const root=new Container(),width=Math.max(16,cell*.24,identity.label.length*cell*.13),height=Math.max(18,cell*.24);
    root.addChild(new Graphics().roundRect(-width/2,-height/2,width,height,cell*.05)
      .fill(0x101c2d).stroke({color:identity.color,width:1.3,alpha:.95}));
    const label=new Text({text:identity.label,style:uiText({fontSize:Math.max(15,cell*.18),fontWeight:'700',fill:identity.color})});
    label.anchor.set(.5);root.addChild(label);
    return root;
  }

  private makeSignals(state:GameState,g:BoardGeometry){
    for(const door of state.items){
      if(door.type!=='door')continue;
      for(const id of door.requires){
        const sw=state.items.find(item=>item.type==='switch'&&item.id===id);
        if(!sw)continue;
        const from=cellCenter(g,sw.x,sw.y),to=cellCenter(g,door.x,door.y);
        const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy)||1;
        const bend={x:(from.x+to.x)/2-dy/len*g.cell*.35,y:(from.y+to.y)/2+dx/len*g.cell*.35};
        const color=this.identities.get(id)!.color,root=new Container();root.eventMode='none';root.visible=false;
        root.addChild(new Graphics().moveTo(from.x,from.y).quadraticCurveTo(bend.x,bend.y,to.x,to.y)
          .stroke({color,width:Math.max(1.2,g.cell*.018),alpha:.48}));
        const dot=new Graphics().circle(0,0,g.cell*.055).fill(color).circle(0,0,g.cell*.022).fill(Theme.white);
        root.addChild(dot);this.signalLayer.addChild(root);this.signals.push({id,root,dot,from,to,bend});
      }
    }
  }

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
      const face=new Graphics(),core=new Graphics();motion.addChild(face,core);const lit=state.activeSwitches.has(item.id);
      const identity=this.identities.get(item.id)!,n:ItemNode={key,kind:item.type,root,motion,face,core,identity,phase:0,lastLit:lit};
      const badge=this.badge(identity,g.cell);badge.position.y=g.cell*.31;motion.addChild(badge);
      this.drawSwitch(n,lit,g);return n;
    }
    if(item.type==='door'){
      const c=g.cell,face=new Graphics(),panels:Container[]=[],badges:NonNullable<ItemNode['badges']>=[];
      const tint=this.identities.get(item.requires[0])?.color??Theme.cyan;
      face.roundRect(-c*.35,-c*.32,c*.70,c*.64,c*.07).fill(this.finish(Theme.wallFace,Theme.boardBottom));
      face.roundRect(-c*.29,-c*.28,c*.58,c*.56,c*.04).fill(Theme.boardBottom);
      motion.addChild(face);
      for(const side of [-1,1]){
        const panel=new Container();panel.position.x=side*c*.29;
        const plate=new Graphics().roundRect(side<0?0:-c*.28,-c*.27,c*.28,c*.54,c*.025)
          .fill(this.finish(mix(tint,Theme.wallFace,.70),Theme.wallInset))
          .stroke({color:Theme.white,width:1,alpha:.16});
        const seam=side<0?c*.26:-c*.26;
        plate.moveTo(seam,-c*.22).lineTo(seam,c*.22).stroke({color:tint,width:Math.max(2,c*.033),alpha:.9});
        plate.moveTo(side<0?c*.09:-c*.09,-c*.06).lineTo(side<0?c*.16:-c*.16,0).lineTo(side<0?c*.09:-c*.09,c*.06)
          .stroke({color:tint,width:1.5,alpha:.65});
        panel.addChild(plate);panels.push(panel);motion.addChild(panel);
      }
      item.requires.forEach((id,index)=>{
        const identity=this.identities.get(id);if(!identity)return;
        const badge=this.badge(identity,c),check=new Graphics().moveTo(-c*.055,0).lineTo(-c*.01,c*.035).lineTo(c*.06,-c*.035)
          .stroke({color:Theme.green,width:Math.max(1.5,c*.023),cap:'round',join:'round'});
        badge.position.set((index-(item.requires.length-1)/2)*Math.max(17,c*.27),c*.30);
        check.position.y=-c*.18;check.visible=false;badge.addChild(check);motion.addChild(badge);badges.push({id,root:badge,check});
      });
      return{key,kind:item.type,root,motion,face,panels,badges,doorId:item.id,phase:0,lastOpen:!!state.activeDoorStates[item.id]};
    }
    if(item.type==='focus'){
      const face=new Graphics(),core=new Graphics(),pips=new Graphics();motion.addChild(face,core,pips);
      const charge=state.focusHits[itemKey(item.x,item.y)]??0;const need=focusNeed(item);
      const counter=new Text({text:'',style:uiText({fontSize:Math.max(18,g.cell*.23),fontWeight:'800',fill:Theme.white})});
      counter.anchor.set(.5);
      const caption=new Container();caption.position.copyFrom(cellCenter(g,item.x,item.y));
      caption.position.x+=g.cell*.06;caption.position.y+=g.cell*.30;
      const captionW=Math.max(32,g.cell*.54),captionH=Math.max(19,g.cell*.27);
      caption.addChild(new Graphics().roundRect(-captionW/2,-captionH/2,captionW,captionH,g.cell*.05).fill(0x14202b),counter);
      this.captions.addChild(caption);
      const n={key,kind:item.type,root,motion,face,core,pips,counter,phase:0,lastCharge:charge,lastLit:charge>=need};
      this.drawFocus(n,charge,need,g);return n;
    }
    if(item.type==='combiner'){
      const collector=new CollectorVisual(g.cell,combinerNeed(item));
      collector.direction.rotation=item.dir*Math.PI/2;
      const charge=state.combinerHits[key]??0,on=!!state.combinerOn[key];
      collector.setCharge(charge,on);motion.addChild(collector);
      const caption=new Container();caption.position.copyFrom(cellCenter(g,item.x,item.y));caption.addChild(collector.caption);this.captions.addChild(caption);
      if(item.fixed){const lock=this.lockMark(g.cell,g.cell*.365);lock.position.x=-g.cell*.20;motion.addChild(lock);}
      return{key,kind:item.type,root,motion,angleCarrier:collector.direction,collector,phase:0,lastCharge:charge,lastLit:on};
    }
    const identity=this.portalIdentities.get(item.pair)!,color=identity.color;
    const c=g.cell,portal=new Graphics();
    this.light(portal,0,c*.035,c*.35,c*.33,Theme.shadow,.38);
    portal.circle(0,0,c*.285).fill(this.finish(mix(color,0x101827,.88),0x060c15))
      .stroke({color,width:Math.max(1.6,c*.024),alpha:.95});
    portal.arc(0,0,c*.285,Math.PI*1.13,Math.PI*1.75)
      .stroke({color:mix(color,Theme.white,.48),width:Math.max(1,c*.012),alpha:.85,cap:'round'});
    this.light(portal,0,0,c*.25,c*.25,color,.19);
    const orbit=new Container();
    const flow=new Container();
    const swirl=new Graphics().arc(0,0,c*.19,-.6,.1).stroke({color:mix(color,Theme.white,.5),width:Math.max(1,c*.014),alpha:.58,cap:'round'})
      .arc(0,0,c*.145,2.1,2.65).stroke({color,width:Math.max(1,c*.012),alpha:.45,cap:'round'});
    for(let i=0;i<2;i++){
      const angle=i*Math.PI+.1,r=c*(i===0?.19:.145);
      swirl.circle(Math.cos(angle)*r,Math.sin(angle)*r,c*.013).fill({color:Theme.white,alpha:.65});
    }
    flow.addChild(swirl);orbit.addChild(flow);
    const mist=new Graphics();this.light(mist,0,0,c*.21,c*.21,color,.28);
    motion.addChild(portal,mist,orbit);
    this.portals.push({flow,mist,phase:item.x*.9+item.y*.5});
    return{key,kind:item.type,root,motion,phase:0};
  }

  private drawSwitch(n:ItemNode,lit:boolean,g:BoardGeometry){
    if(!n.face||!n.core)return;
    const c=g.cell,r=c*.245,group=n.identity?.color??Theme.cyan,color=lit?group:mix(group,Theme.switchOff,.72);
    n.face.clear();
    this.light(n.face,0,c*.025,c*.33,c*.33,lit?Theme.green:Theme.shadow,lit?.18:.4);
    n.face.circle(0,c*.025,r).fill(Theme.boardBottom);
    n.face.circle(0,0,r)
      .fill(this.finish(mix(color,Theme.white,lit?.12:.15),mix(color,Theme.boardBottom,.24)))
      .stroke({color:group,width:Math.max(1.5,c*.025),alpha:lit?1:.72});
    // A power mark is a functional glyph, replacing the old bullseye.
    n.core.clear().arc(0,0,c*.092,-Math.PI*.25,Math.PI*1.25)
      .stroke({color:lit?Theme.white:group,width:Math.max(2,c*.033),alpha:.95,cap:'round'});
    n.core.moveTo(0,-c*.13).lineTo(0,-c*.01)
      .stroke({color:lit?Theme.white:group,width:Math.max(2,c*.033),cap:'round'});
    if(lit)n.core.moveTo(c*.14,-c*.19).lineTo(c*.19,-c*.14).lineTo(c*.28,-c*.24)
      .stroke({color:Theme.green,width:Math.max(2,c*.03),cap:'round',join:'round'});
  }

  private drawFocus(n:ItemNode,charge:number,need:number,g:BoardGeometry){
    if(!n.face||!n.core)return;
    const on=charge>=need,c=g.cell,r=c*.36,color=on?Theme.green:Theme.gold;
    const hex=(dy:number)=>[0,-r+dy,r*.72,-r*.2+dy,r*.72,r*.2+dy,0,r+dy,-r*.72,r*.2+dy,-r*.72,-r*.2+dy];
    n.face.clear();
    this.light(n.face,0,0,c*.36,c*.38,color,on?.24:.075);
    n.face.poly(hex(c*.027),true).fill(Theme.boardBottom);
    n.face.poly(hex(0),true)
      .fill(this.finish(mix(color,Theme.boardBottom,.68),mix(color,Theme.boardBottom,.90)))
      .stroke({color,width:Math.max(2,c*.032),alpha:.95});
    n.face.poly([0,-r*.9,r*.65,-r*.18,-r*.65,-r*.18],true).fill({color:Theme.white,alpha:.13});
    n.core.clear();
    this.light(n.core,0,0,c*.20,c*.20,color,on?.45:.08);
    if(n.counter){n.counter.text=on?'✓':`${Math.min(charge,need)}/${need}`;n.counter.tint=on?0x7cfdbe:0xffdf80;}
    if(n.pips){
      const width=c*.47,height=c*.085;
      n.pips.clear().roundRect(-width/2,-c*.045,width,height,height/2).fill(0x101c2d)
        .stroke({color,width:1,alpha:.65});
      if(charge>0)n.pips.roundRect(-width/2+c*.015,-c*.03,(width-c*.03)*Math.min(1,charge/need),height-c*.03,height/3).fill(color);
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
