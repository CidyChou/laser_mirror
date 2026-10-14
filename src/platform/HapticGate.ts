import type { HapticKind } from './IPlatform';

const PRIORITY:Record<HapticKind,number>={light:0,medium:1,heavy:2,launch:3,success:4};
const GAP:Record<HapticKind,number>={light:90,medium:70,heavy:70,launch:130,success:120};

/** Rate-limit busy collisions without losing the charge release or victory. */
export class HapticGate {
  private lastAt=-Infinity;
  private lastKind:HapticKind='light';

  allows(kind:HapticKind,now:number):boolean {
    const stronger=PRIORITY[kind]>PRIORITY[this.lastKind];
    if(!stronger&&now-this.lastAt<Math.max(GAP[kind],GAP[this.lastKind]))return false;
    this.lastAt=now;this.lastKind=kind;
    return true;
  }
}
