import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { Theme } from '../theme';

export class Button extends Container {
  private shadow=new Graphics();
  private glow=new Graphics();
  private bg=new Graphics();
  private topLight=new Graphics();
  private indicator=new Graphics();
  private label=new Text({text:'',style:{fontFamily:'Arial',fontSize:26,fontWeight:'700',fill:Theme.text}});
  private disabledState=false;
  private activeState=false;

  constructor(public readonly widthPx:number,public readonly heightPx:number,text:string,private readonly kind:'primary'|'secondary'|'icon'='primary'){
    super();
    this.glow.blendMode='add'; this.indicator.blendMode='add';
    this.addChild(this.shadow,this.glow,this.bg,this.topLight,this.indicator,this.label);
    this.label.anchor.set(.5); this.label.position.set(widthPx/2,heightPx/2);
    this.eventMode='static'; this.cursor='pointer'; this.hitArea=new Rectangle(0,0,widthPx,heightPx);
    this.setText(text); this.redraw();
  }
  setText(text:string){this.label.text=text;}
  setDisabled(value:boolean){this.disabledState=value;this.eventMode=value?'none':'static';this.cursor=value?'default':'pointer';this.redraw();}
  setActive(value:boolean){this.activeState=value;this.redraw();}

  private redraw(){
    this.shadow.clear();this.glow.clear();this.bg.clear();this.topLight.clear();this.indicator.clear();
    const radius=this.kind==='icon'?14:17;
    const active=this.activeState&&this.kind==='primary';
    const disabled=this.disabledState;
    let fill=0x424b5d;
    if(this.kind==='secondary') fill=0x3acbff;
    if(this.kind==='icon') fill=0x202b3d;
    if(active) fill=0xf04e70;
    if(disabled&&!active) fill=0x2a3241;

    this.shadow.roundRect(0,5,this.widthPx,this.heightPx,radius).fill({color:0x02050a,alpha:.34});
    if(active) this.glow.roundRect(-4,-4,this.widthPx+8,this.heightPx+8,radius+4).fill({color:Theme.beam,alpha:.10});
    this.bg.roundRect(0,0,this.widthPx,this.heightPx,radius).fill(fill).stroke({color:0xffffff,width:1,alpha:.08});
    this.topLight.roundRect(2,2,this.widthPx-4,Math.max(8,this.heightPx*.34),radius-2).fill({color:0xffffff,alpha:disabled&&!active?.025:.07});
    this.topLight.moveTo(radius+8,2).lineTo(this.widthPx-radius-8,2).stroke({color:0xffffff,width:1,alpha:.10});

    (this.label.style as any).fill=this.kind==='secondary'?0x08131c:Theme.text;
    this.label.alpha=disabled&&!active?.50:1;
    if(this.kind==='primary'){
      const dotX=this.widthPx*.31;
      this.indicator.circle(dotX,this.heightPx/2,5).fill({color:active?0xffffff:0xaeb8c9,alpha:disabled&&!active?.28:1});
      if(active)this.indicator.circle(dotX,this.heightPx/2,12).fill({color:0xffffff,alpha:.10});
    }
  }
}
