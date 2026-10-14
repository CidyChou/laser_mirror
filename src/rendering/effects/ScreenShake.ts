type Impulse={start:number;strength:number;angle:number;duration:number};

/** Short, bounded recoil in design pixels; never moves the HUD or camera scale. */
export class ScreenShake {
  readonly offset={x:0,y:0};
  private impulses:Impulse[]=[];

  trigger(now:number,strength:number,angle:number,duration=180){
    if(this.impulses.length===4)this.impulses.shift();
    this.impulses.push({start:now,strength,angle,duration});
  }

  update(now:number){
    let x=0,y=0;
    for(let i=this.impulses.length-1;i>=0;i--){
      const pulse=this.impulses[i],age=now-pulse.start;
      if(age>=pulse.duration){this.impulses.splice(i,1);continue;}
      if(age<0)continue;
      const t=age/pulse.duration;
      const kick=-Math.cos(age*.058)*(1-t)**2*pulse.strength;
      x+=Math.cos(pulse.angle)*kick;
      y+=Math.sin(pulse.angle)*kick;
    }
    this.offset.x=Math.max(-8,Math.min(8,x));
    this.offset.y=Math.max(-8,Math.min(8,y));
    return this.offset;
  }

  clear(){this.impulses=[];this.offset.x=0;this.offset.y=0;}
  get active(){return this.impulses.length>0;}
}
