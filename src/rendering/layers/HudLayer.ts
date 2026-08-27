import { Container, Graphics, Text } from 'pixi.js';
import type { GameState } from '@/gameplay/types';
import { Button } from '../ui/Button';
import { Theme } from '../theme';

export class HudLayer extends Container{
  private chapter=new Text({text:'',style:{fontFamily:'Arial',fontSize:14,fill:Theme.muted}});
  private levelValue=new Text({text:'',style:{fontFamily:'Arial',fontSize:25,fontWeight:'700',fill:Theme.text}});
  private shotsValue=new Text({text:'',style:{fontFamily:'Arial',fontSize:25,fontWeight:'700',fill:Theme.text}});
  private targetValue=new Text({text:'',style:{fontFamily:'Arial',fontSize:25,fontWeight:'700',fill:Theme.text}});
  private hint=new Text({text:'',style:{fontFamily:'Arial',fontSize:14,fill:Theme.muted,align:'center',wordWrap:true,wordWrapWidth:640}});
  readonly fireButton=new Button(640,72,'发射激光','primary');
  readonly nextButton=new Button(640,64,'下一关','secondary');
  readonly resetButton=new Button(52,52,'↻','icon');

  constructor(){super();this.build();}
  private build(){
    const brandBeam=new Graphics().roundRect(0,0,7,33,5).fill(Theme.beam); brandBeam.position.set(40,34); brandBeam.skew.x=-.20; brandBeam.blendMode='add';
    const brand=new Text({text:'LASER MIRROR',style:{fontFamily:'Arial',fontSize:27,fontWeight:'900',fill:Theme.text,letterSpacing:2}}); brand.position.set(58,34);
    this.chapter.position.set(58,68); this.resetButton.position.set(628,32); this.addChild(brandBeam,brand,this.chapter,this.resetButton);

    const labels=['关卡','剩余激光','终点']; const values=[this.levelValue,this.shotsValue,this.targetValue];
    for(let i=0;i<3;i++){
      const x=40+i*214;
      const card=new Graphics()
        .roundRect(x,105,198,82,15).fill({color:Theme.panel,alpha:.98}).stroke({color:0xffffff,width:1,alpha:.07})
        .roundRect(x+2,107,194,31,13).fill({color:0xffffff,alpha:.025});
      const label=new Text({text:labels[i],style:{fontFamily:'Arial',fontSize:14,fill:Theme.muted}}); label.position.set(x+16,119); values[i].position.set(x+16,143); this.addChild(card,label,values[i]);
    }

    this.fireButton.position.set(40,1120); this.nextButton.position.set(40,1202); this.hint.anchor.set(.5,0); this.hint.position.set(360,1284); this.addChild(this.fireButton,this.nextButton,this.hint);
  }
  sync(state:GameState,total:number){
    this.chapter.text=`${state.level.chapter} · ${state.level.name}`;
    this.levelValue.text=`${state.levelIndex+1} / ${total}`;
    this.shotsValue.text=String(state.shotsLeft);
    this.targetValue.text=`${state.targets.filter(t=>t.hit).length} / ${state.targets.length}`;
    this.hint.text=state.level.hint||'镜子可无限旋转 · 确认路线后再试射';
    this.fireButton.setDisabled(state.firing||state.won||state.shotsLeft<=0);
    this.fireButton.setActive(state.firing||state.won);
    this.fireButton.setText(state.firing?'能量发射中…':state.won?'光路接通':state.shotsLeft<=0?'激光已耗尽':`发射激光 · ${state.shotsLeft} 次`);
    this.nextButton.visible=state.won;
  }
}
