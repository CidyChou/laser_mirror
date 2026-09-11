import { Container, Graphics, Text } from 'pixi.js';
import { Button } from '../ui/Button';
import { Theme, uiText } from '../theme';
import { cellCenter, computeGeometry } from '@/gameplay/geometry';
import type { GameState } from '@/gameplay/types';

/** One stable outline per interactive optic; no animated full-screen filter. */
export class TimeSkillLayer extends Container {
  readonly adjustment = new Button(272, 76, '✦ 神之手', 'secondary');
  /** Kept wired for a later release; intentionally hidden in the current UI. */
  readonly bullet = new Button(272, 76, 'Ⅱ 子弹时间', 'secondary');
  readonly rewind = new Button(272, 76, '↶ 时光回溯', 'secondary');
  private outline = new Graphics();
  private status = new Text({text:'',style:uiText({fontSize:18,fill:Theme.ink,align:'center'})});
  private signature = '';
  constructor() {
    super();this.eventMode='passive';
    this.adjustment.position.set(72,1170);this.bullet.position.set(72,1170);this.rewind.position.set(376,1170);
    this.adjustment.setLabelSize(22);this.bullet.setLabelSize(22);this.rewind.setLabelSize(22);
    this.adjustment.eventMode='none';this.bullet.visible=false;
    this.status.anchor.set(.5);this.status.position.set(360,1262);
    this.outline.eventMode='none';this.status.eventMode='none';
    this.addChild(this.outline,this.adjustment,this.bullet,this.rewind,this.status);
  }
  sync(state:GameState) {
    const t=state.timeSkill,r=state.level.timeBoss;
    this.visible=!!t;if(!t||!r)return;
    const ready=state.firing&&state.shotElapsedMs>=480&&!t.tutorial;
    this.bullet.visible=false;this.rewind.visible=r.rewindUses>0;
    this.adjustment.x=r.rewindUses>0?72:224;this.rewind.x=r.rewindUses>0?376:224;
    this.adjustment.setText(`✦ 神之手  ×${t.adjustmentUses}`);
    this.bullet.setText(`Ⅱ 子弹时间  ×${t.bulletTimeUses}`);
    this.rewind.setText(`↶ 回溯${r.rewindCells??2}格  ×${t.rewindUses}`);
    this.adjustment.setDisabled(!ready||!t.canOperate||t.adjustmentUses<=0);
    this.bullet.setDisabled(true);
    this.rewind.setDisabled(!ready||t.phase!=='idle'||!t.canRewind||t.rewindUses<=0);
    this.bullet.setActive(t.phase==='bullet');this.rewind.setActive(t.phase==='rewind'||t.phase==='recover');
    const label=t.phase==='bullet'?'子弹时间':t.phase==='rewind'?'正在回溯':t.phase==='recover'?'恢复前进':'';
    this.status.text=label?`${label} ${(t.remainingMs/1000).toFixed(1)}s${t.canOperate?' · 可使用神之手':''}`:state.won?'章节挑战完成':state.firing?(t.adjustmentUses>0?'观察光束 · 点击镜面使用神之手':'神之手次数已用完'):'章节挑战 · 调整次数每次发射重置';
    const signature=`${state.levelIndex}:${t.canOperate}:${t.phase==='rewind'}`;
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
