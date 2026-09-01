import { GameConfig } from '@/config/GameConfig';

/** Shared travel clock: charge pauses must have the same duration at any speed. */
export function laserDistanceAtMs(ms:number):number {
  const seconds=Math.max(0,ms)/1000;
  const {startSpeed,acceleration,maxSpeed}=GameConfig.laser;
  const ramp=Math.min(seconds,(maxSpeed-startSpeed)/acceleration);
  return startSpeed*ramp+.5*acceleration*ramp*ramp+Math.max(0,seconds-ramp)*maxSpeed;
}

export function laserMsAtDistance(distance:number):number {
  const d=Math.max(0,distance);
  const {startSpeed,acceleration,maxSpeed}=GameConfig.laser;
  const ramp=(maxSpeed-startSpeed)/acceleration;
  const rampDistance=startSpeed*ramp+.5*acceleration*ramp*ramp;
  return 1000*(d<=rampDistance
    ?(Math.sqrt(startSpeed*startSpeed+2*acceleration*d)-startSpeed)/acceleration
    :ramp+(d-rampDistance)/maxSpeed);
}
