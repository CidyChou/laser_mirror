import { Container, FillGradient, Graphics, Text } from 'pixi.js';
import { isLightTheme, Theme, uiText } from '../theme';

/** Circular collecting chamber: discrete inputs, focused charge, then release. */
export class CollectorVisual extends Container {
  readonly direction=new Container();
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
    const glass=this.gradient(Theme.mirrorShade,Theme.switchOff);
    const halo=new FillGradient({type:'radial',center:{x:.5,y:.5},outerRadius:.5,textureSize:64,
      colorStops:[{offset:0,color:'#ffffffff'},{offset:.25,color:'#ffffffaa'},{offset:.65,color:'#ffffff25'},{offset:1,color:'#ffffff00'}]});
    this.fills.push(halo);
    this.glow.circle(0,0,c*.43).fill(halo);this.glow.tint=Theme.cyan;this.glow.blendMode=blend;
    const body=new Graphics().circle(0,c*.035,c*.29).fill({color:Theme.shadow,alpha:.38})
      .circle(0,0,c*.29).fill(metal).stroke({color:Theme.white,width:1.2,alpha:.16})
      .circle(0,0,c*.195).fill(glass);
    this.lens.circle(0,0,c*.18).fill(halo);this.lens.tint=Theme.cyan;this.lens.blendMode=blend;
    this.lens.alpha=.14;
    this.chamber.addChild(body,this.lens);
    for(let i=0;i<need;i++){
      const span=Math.PI*1.54/need,start=Math.PI*.23+i*span;
      const arc=new Graphics().arc(0,0,c*.253,start+.055,start+span-.055)
        .stroke({color:Theme.white,width:Math.max(2,c*.032),cap:'round'});
      this.marks.push(arc);this.chamber.addChild(arc);
    }
    // Two optical inlets taper into the chamber. The open side is the outlet.
    const nozzle=new Graphics()
      .moveTo(-c*.29,-c*.10).lineTo(-c*.19,-c*.055)
      .moveTo(-c*.29,c*.10).lineTo(-c*.19,c*.055)
      .stroke({color:Theme.cyanSoft,width:Math.max(1.6,c*.023),alpha:.78,cap:'round'})
      .poly([c*.355,0,c*.22,-c*.09,c*.22,c*.09],true).fill(Theme.mirrorCore);
    this.direction.addChild(nozzle);
    this.sweep.arc(0,0,c*.253,-.75,0).stroke({color:Theme.laserPlasma,width:Math.max(2,c*.037),cap:'round'});
    this.sweep.blendMode=blend;
    for(let i=0;i<6;i++){
      const spark=new Graphics().roundRect(-c*.032,-c*.008,c*.064,c*.016,c*.008).fill(Theme.laserPlasma);
      spark.blendMode=blend;this.sparks.addChild(spark);
    }
    this.counter=new Text({text:`0/${need}`,style:uiText({fontSize:Math.max(16,c*.16),fill:Theme.white})});
    // Keep the caption out of both incoming axes and the much wider outlet.
    this.counter.anchor.set(.5);this.counter.position.set(c*.23,c*.365);
    this.addChild(this.glow,this.chamber,this.sweep,this.sparks,this.counter,this.direction);
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
    this.setCaption(fired?'':`${this.charge}/${this.need}`);
  }
  private setCaption(text:string){if(this.counter.text!==text)this.counter.text=text;}
  get full(){return this.charge>=this.need;}

  animate(now:number,progress:number|null,releaseAge:number){
    this.sweep.visible=progress!==null;this.sparks.visible=progress!==null;
    this.chamber.scale.set(1);this.glow.scale.set(1);this.lens.scale.set(1);
    this.counter.alpha=1;
    if(progress!==null){
      this.setCaption('蓄力');
      this.counter.tint=isLightTheme()?Theme.beam2:Theme.laserPlasma;
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
      this.setCaption(this.fired?'':`${this.charge}/${this.need}`);
      this.counter.tint=isLightTheme()?Theme.text:Theme.cyanSoft;
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
