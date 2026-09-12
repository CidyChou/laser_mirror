import { Container, Graphics, Text } from 'pixi.js';
import { Button } from '../ui/Button';
import { Theme, uiText } from '../theme';
import { cellCenter, computeGeometry } from '@/gameplay/geometry';
import type { GameState } from '@/gameplay/types';

export class TimeSkillLayer extends Container {
  readonly adjustment = new Button(272, 76, '✦ 神之手', 'secondary');
  /** Reserved skill; not exposed by this release. */
  readonly bullet = new Button(272, 76, 'Ⅱ 子弹时间', 'secondary');
  private outline = new Graphics();
  private lifeBar = new Graphics();
  private status = new Text({text:'',style:uiText({fontSize:18,fill:Theme.ink,align:'center'})});
  private signature = '';
  constructor() {
    super();this.eventMode='passive';
    this.adjustment.position.set(224,1170);this.bullet.position.set(224,1170);
    this.adjustment.setLabelSize(22);this.adjustment.eventMode='none';this.bullet.visible=false;
    this.status.anchor.set(.5);this.status.position.set(360,1262);
    this.outline.eventMode='none';this.status.eventMode='none';this.lifeBar.eventMode='none';
    this.addChild(this.outline,this.adjustment,this.bullet,this.lifeBar,this.status);
  }
  sync(state:GameState) {
    const t=state.timeSkill;
    this.visible=!!t;if(!t)return;
    this.adjustment.setText(`✦ 神之手  ×${t.adjustmentUses}`);
    this.adjustment.setDisabled(!state.firing||!t.canOperate);
    const seconds=(Math.ceil(t.lifetimeRemainingMs/100)/10).toFixed(1);
    this.status.text=state.won?'章节挑战完成':state.firing?
      `${t.adjustmentUses>0?'点击镜面换向':'次数用完 · 光束消散中'} · ${seconds}s`:
      '发射后激光逐渐缩短 · 消失即失败';
    this.lifeBar.clear();
    if(state.firing){
      this.lifeBar.roundRect(224,1248,272,3,1.5).fill({color:Theme.ink,alpha:.16});
      if(t.beamLife>0)this.lifeBar.roundRect(224,1248,272*t.beamLife,3,1.5).fill({color:t.lifetimeRemainingMs<=3000?Theme.beam:Theme.cyan,alpha:.9});
    }
    const signature=`${state.levelIndex}:${state.level.name}:${t.canOperate}`;
    if(signature!==this.signature){
      this.signature=signature;this.outline.clear();
      if(t.canOperate){const g=computeGeometry(state.level);for(const i of state.items){
        if(!['mirror','splitter','combiner'].includes(i.type)||('fixed'in i&&i.fixed))continue;
        const p=cellCenter(g,i.x,i.y),a=g.cell*.42;
        this.outline.roundRect(p.x-a,p.y-a,a*2,a*2,8).stroke({color:Theme.cyan,width:2.5,alpha:.9});
      }}
    }
  }
}
