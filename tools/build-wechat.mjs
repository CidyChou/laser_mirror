import { spawn } from 'node:child_process';
import { access, cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const outputDirectory = 'dist/wechat';
const WECHAT_MAIN_PACK_LIMIT = 4 * 1024 * 1024;
const configNames = ['game.json', 'project.config.json', 'project.private.config.json'];
const copyOptions = {
  recursive: true,
  filter: (source) => !source.endsWith('.DS_Store') && !source.split(/[/\\]/).some((part) => part.startsWith('._')),
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

async function directorySize(directory) {
  let total = 0;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.DS_Store' || entry.name.startsWith('._')) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(fullPath);
    else total += (await stat(fullPath)).size;
  }
  return total;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const configBackup = {};
for (const name of configNames) {
  const path = join(outputDirectory, name);
  if (await exists(path)) configBackup[name] = await readFile(path, 'utf8');
}

await run('npx', ['vite', 'build', '--mode', 'wechat']);
await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  cp('public/audio', join(outputDirectory, 'audio'), copyOptions),
  cp('public/ui', join(outputDirectory, 'ui'), copyOptions),
]);

for (const name of configNames) {
  const dest = join(outputDirectory, name);
  if (configBackup[name]) await writeFile(dest, configBackup[name]);
  else await cp(join('templates/wechat', name), dest);
}

const requiredFiles = [
  'game.js',
  'game.json',
  'project.config.json',
  'audio/laser_fire.mp3',
  'audio/coin-pickup.mp3',
  'audio/level-victory.mp3',
  'audio/game-over.mp3',
  'ui/settings-gear.png',
  'ui/victory-crown.png',
  'ui/victory-coin.png',
  'ui/app-icon.png',
];
for (const relativePath of requiredFiles) {
  const filePath = join(outputDirectory, relativePath);
  if (!(await exists(filePath))) {
    throw new Error(`WeChat package is missing required file: ${resolve(filePath)}`);
  }
}

const [packageBytes, audioBytes, uiBytes, scriptBytes] = await Promise.all([
  directorySize(outputDirectory),
  directorySize(join(outputDirectory, 'audio')),
  directorySize(join(outputDirectory, 'ui')),
  stat(join(outputDirectory, 'game.js')).then((info) => info.size),
]);

console.log('Built WeChat Mini Game package:');
console.log(`  ${resolve(outputDirectory)}`);
console.log(`  audio ${formatMb(audioBytes)} · ui ${formatMb(uiBytes)} · game.js ${formatMb(scriptBytes)}`);
console.log(`  total ${formatMb(packageBytes)} / ${formatMb(WECHAT_MAIN_PACK_LIMIT)} main-package limit`);
console.log('  Open this directory in WeChat DevTools (compileType: game).');

if (packageBytes > WECHAT_MAIN_PACK_LIMIT) {
  throw new Error(
    `WeChat 主包 ${formatMb(packageBytes)} 已超过 4 MB。开发者工具仍可本地预览，但真机预览会失败。请先缩小资源或拆分包。`,
  );
}
