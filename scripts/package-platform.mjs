import fs from 'node:fs';import path from 'node:path';
const platform=process.argv[2];if(!['wechat','douyin','xhs'].includes(platform))throw new Error('platform must be wechat/douyin/xhs');const dir=path.resolve('dist',platform);fs.mkdirSync(dir,{recursive:true});
const configs={
  wechat:{game:{deviceOrientation:'portrait',showStatusBar:false},project:{description:'Laser Mirror',compileType:'game',appid:'touristappid',projectname:'laser-mirror',setting:{es6:true,minified:true}}},
  douyin:{game:{deviceOrientation:'portrait',showStatusBar:false},project:{appid:'testAppId',projectname:'laser-mirror',compileType:'game'}},
  xhs:{game:{showStatusBar:false},project:{appid:'',projectname:'laser-mirror',compileType:'game'}},
};
fs.writeFileSync(path.join(dir,'game.json'),JSON.stringify(configs[platform].game,null,2));fs.writeFileSync(path.join(dir,'project.config.json'),JSON.stringify(configs[platform].project,null,2));console.log(`Packaged ${platform}: ${dir}`);
