import { GameConfig } from '@/config/GameConfig';

/** Challenge stages run at a gentler pace while keeping the ordinary curve shape. */
export const TIME_BOSS_SPEED_SCALE = 0.8;

/** Shared travel clock: charge pauses must have the same duration at any speed. */
export function laserDistanceAtMs(ms:number, speedScale = 1):number {
  const seconds=Math.max(0,ms)/1000;
  const {startSpeed,acceleration,maxSpeed}=GameConfig.laser;
  const ramp=Math.min(seconds,(maxSpeed-startSpeed)/acceleration);
  return (startSpeed*ramp+.5*acceleration*ramp*ramp+Math.max(0,seconds-ramp)*maxSpeed)*speedScale;
}

export function laserMsAtDistance(distance:number, speedScale = 1):number {
  const d=Math.max(0,distance)/speedScale;
  const {startSpeed,acceleration,maxSpeed}=GameConfig.laser;
  const ramp=(maxSpeed-startSpeed)/acceleration;
  const rampDistance=startSpeed*ramp+.5*acceleration*ramp*ramp;
  return 1000*(d<=rampDistance
    ?(Math.sqrt(startSpeed*startSpeed+2*acceleration*d)-startSpeed)/acceleration
    :ramp+(d-rampDistance)/maxSpeed);
}
