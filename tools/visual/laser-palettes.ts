import type { ThemePalette } from '../../src/rendering/theme';

type LaserColors={mist:number;corona:number;body:number;plasma:number;core:number};

/** Preview-only palettes. The game's default theme is deliberately unchanged. */
export const LASER_PALETTES:ReadonlyArray<{id:string;name:string;colors:LaserColors|null}>=[
  {id:'original',name:'粉紫 · 当前效果',colors:null},
  {id:'ice',name:'冰蓝 · 冷光',colors:{mist:0x6651dc,corona:0x287aff,body:0x38bbff,plasma:0x9de6ff,core:0xf0fbff}},
  {id:'teal',name:'青碧 · 极光',colors:{mist:0x426cd8,corona:0x00b8ae,body:0x24ecd4,plasma:0x9bffe8,core:0xf0fffb}},
  {id:'emerald',name:'翠绿 · 翡翠',colors:{mist:0x2c9290,corona:0x24bc56,body:0x64f448,plasma:0xc4ffa0,core:0xf7fff0}},
  {id:'amber',name:'金橙 · 熔光',colors:{mist:0xb64f88,corona:0xff6824,body:0xffb338,plasma:0xffdf91,core:0xfffbef}},
  {id:'crimson',name:'赤红 · 炽焰',colors:{mist:0x963bb7,corona:0xef174e,body:0xff403d,plasma:0xffa898,core:0xfff4ed}},
  {id:'violet',name:'紫罗兰 · 电浆',colors:{mist:0x475fce,corona:0x7138ff,body:0xb25bff,plasma:0xdfb2ff,core:0xfbf3ff}},
  {id:'silver',name:'银白 · 星芒',colors:{mist:0x577cae,corona:0x849cce,body:0xc1d5ef,plasma:0xe1f0ff,core:0xffffff}},
];

export function applyLaserPalette(theme:ThemePalette,id:string){
  const colors=LASER_PALETTES.find(palette=>palette.id===id)?.colors;
  if(!colors)return;
  Object.assign(theme,{
    beam:colors.body,beamHot:colors.plasma,beam2:colors.corona,beamCore:colors.core,
    laserBody:colors.body,laserPlasma:colors.plasma,laserCore:colors.core,laserMist:colors.mist,
  });
}
