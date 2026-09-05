import { Container, FillGradient, Graphics, Text } from 'pixi.js';
import { isLightTheme, Theme, uiText } from '../theme';

/** Faceted optical hub: input slots, a readable charge count, and one output nozzle. */
export class CollectorVisual extends Container {
  readonly direction=new Container();
  readonly caption=new Container();
  private readonly chamber=new Container();
  private readonly glow=new Graphics();
  private readonly lens=new Graphics();
  private readonly sweep=new Graphics();
  private readonly sparks=new Container();
  private readonly counter:Text;
  private readonly marks:Graphics[]=[];
  private readonly fills:FillGradient[]=[];
  private charge=0;
  private fired=false;

  constructor(private readonly cell:number,private readonly need:number){
    super();
    const c=cell,blend=isLightTheme()?'normal':'add';
    const metal=this.gradient(Theme.raisedFixed,Theme.boardBottom);
    const glass=this.gradient(Theme.switchOff,Theme.boardBottom);
    const halo=new FillGradient({type:'radial',center:{x:.5,y:.5},outerRadius:.5,textureSize:64,
      colorStops:[{offset:0,color:'#ffffffff'},{offset:.25,color:'#ffffffaa'},{offset:.65,color:'#ffffff25'},{offset:1,color:'#ffffff00'}]});
    this.fills.push(halo);
    this.glow.circle(0,0,c*.43).fill(halo);this.glow.tint=Theme.cyan;this.glow.blendMode=blend;
    const outline=[-c*.18,-c*.31,c*.18,-c*.31,c*.30,-c*.16,c*.30,c*.16,c*.18,c*.31,-c*.18,c*.31,-c*.30,c*.16,-c*.30,-c*.16];
    const body=new Graphics().poly(outline.map((v,i)=>i%2?v+c*.035:v),true).fill({color:Theme.shadow,alpha:.38})
      .poly(outline,true).fill(metal).stroke({color:Theme.cyan,width:Math.max(1.4,c*.024),alpha:.68})
      .roundRect(-c*.225,-c*.225,c*.45,c*.45,c*.065).fill(glass);
    body.moveTo(-c*.17,-c*.28).lineTo(c*.14,-c*.28).stroke({color:Theme.cyanSoft,width:1.3,alpha:.65});
    this.lens.circle(0,0,c*.22).fill(halo);this.lens.tint=Theme.cyan;this.lens.blendMode=blend;
    this.lens.alpha=.14;
    this.chamber.addChild(body,this.lens);
    this.chamber.addChild(new Graphics().poly([0,-c*.115,c*.11,0,0,c*.115,-c*.11,0],true)
      .fill({color:Theme.cyan,alpha:.70}).stroke({color:Theme.cyanSoft,width:1.2,alpha:.8})
      .poly([0,-c*.115,0,c*.115,-c*.11,0],true).fill({color:Theme.white,alpha:.16}));
    for(let i=0;i<need;i++){
      const step=c*.35/need,x=-c*.175+step*i;
      body.roundRect(x,c*.14,step*.78,c*.05,c*.013).fill({color:Theme.cyan,alpha:.17});
      const slot=new Graphics().roundRect(x,c*.14,step*.78,c*.05,c*.013).fill(Theme.white);
      this.marks.push(slot);this.chamber.addChild(slot);
    }
    // Two optical inlets taper into the chamber. The open side is the outlet.
    const nozzle=new Graphics()
      .moveTo(-c*.35,-c*.14).lineTo(-c*.26,-c*.08)
      .moveTo(-c*.35,c*.14).lineTo(-c*.26,c*.08)
      .stroke({color:Theme.cyanSoft,width:Math.max(1.6,c*.023),alpha:.78,cap:'round'})
      .poly([c*.40,0,c*.26,-c*.115,c*.26,c*.115],true).fill(Theme.cyanSoft)
      .moveTo(c*.25,0).lineTo(c*.32,0).stroke({color:Theme.boardBottom,width:Math.max(2,c*.03),cap:'round'});
    this.direction.addChild(nozzle);
    this.sweep.arc(0,0,c*.253,-.75,0).stroke({color:Theme.laserPlasma,width:Math.max(2,c*.037),cap:'round'});
    this.sweep.blendMode=blend;
    for(let i=0;i<6;i++){
      const spark=new Graphics().roundRect(-c*.032,-c*.008,c*.064,c*.016,c*.008).fill(Theme.laserPlasma);
      spark.blendMode=blend;this.sparks.addChild(spark);
    }
    this.counter=new Text({text:`0/${need}`,style:uiText({fontSize:Math.max(18,c*.21),fontWeight:'700',fill:Theme.white})});
    this.counter.anchor.set(.5);
    const captionW=Math.max(36,c*.56),captionH=Math.max(19,c*.27);
    this.caption.position.set(c*.06,c*.30);
    this.caption.addChild(new Graphics().roundRect(-captionW/2,-captionH/2,captionW,captionH,c*.05).fill(0x14202b),this.counter);
    this.addChild(this.glow,this.chamber,this.sweep,this.sparks,this.caption,this.direction);
    this.setCharge(0,false);this.animate(0,null,Infinity);
  }

  private gradient(top:number,bottom:number){
    const fill=new FillGradient({start:{x:0,y:0},end:{x:0,y:1},textureSize:64,
      colorStops:[{offset:0,color:top},{offset:1,color:bottom}]});
    this.fills.push(fill);return fill;
  }

  setCharge(charge:number,fired:boolean){
    this.charge=Math.min(this.need,charge);this.fired=fired;
    this.marks.forEach((mark,i)=>{mark.tint=fired?Theme.laserPlasma:Theme.cyan;mark.alpha=i<this.charge?.95:.16;});
    this.setCaption(fired?'✓':`${this.charge}/${this.need}`);
  }
  private setCaption(text:string){if(this.counter.text!==text)this.counter.text=text;}
  get full(){return this.charge>=this.need;}

  animate(now:number,progress:number|null,releaseAge:number){
    this.sweep.visible=progress!==null;this.sparks.visible=progress!==null;
    this.chamber.scale.set(1);this.glow.scale.set(1);this.lens.scale.set(1);
    this.counter.alpha=1;
    if(progress!==null){
      this.setCaption('蓄力');
      this.counter.tint=0xffc1d4;
      const pulse=.5+.5*Math.sin(now*(.012+progress*.020));
      this.glow.tint=Theme.beam;this.glow.alpha=.18+progress*.35+pulse*.06;
      this.glow.scale.set(1.08-progress*.22);
      this.lens.tint=Theme.laserPlasma;this.lens.alpha=.30+progress*.6;
      this.lens.scale.set(1.18-progress*.38+pulse*.06);
      this.sweep.rotation=now*.009+progress*Math.PI*4;
      for(let i=0;i<this.sparks.children.length;i++){
        const phase=(now*.0018+i/6)%1,angle=i*Math.PI/3+progress*.4;
        const r=this.cell*(.40-phase*.29),spark=this.sparks.children[i];
        spark.position.set(Math.cos(angle)*r,Math.sin(angle)*r);spark.rotation=angle;
        spark.alpha=Math.sin(phase*Math.PI)*(.40+progress*.6);
      }
    }else{
      this.setCaption(this.fired?'✓':`${this.charge}/${this.need}`);
      this.counter.tint=0xb3efff;
      this.glow.tint=this.fired?Theme.beam:Theme.cyan;
      this.lens.tint=this.fired?Theme.laserPlasma:Theme.cyan;
      const flash=this.fired?Math.max(0,1-releaseAge/380):0;
      this.glow.alpha=(this.fired?.22:.06+this.charge/this.need*.10)+flash*.50;
      this.glow.scale.set(1+flash*.52);this.chamber.scale.set(1+flash*.10);
      this.lens.alpha=(this.fired?.7:.12+this.charge/this.need*.12)+flash*.28;
      this.lens.scale.set(1+flash*.32);
    }
  }

  override destroy(options?:Parameters<Container['destroy']>[0]){
    super.destroy(options);this.fills.forEach(fill=>fill.destroy());
  }
}
