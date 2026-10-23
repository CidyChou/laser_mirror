import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
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

async function assertNoLocalWebp(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) await assertNoLocalWebp(fullPath);
    else if (entry.name.toLowerCase().endsWith('.webp')) {
      throw new Error(
        `WeChat package contains local WebP (${fullPath}). DevTools can decode it, but many real devices cannot. Use PNG or JPEG.`,
      );
    }
  }
}

const configBackup = {};
for (const name of configNames) {
  const path = join(outputDirectory, name);
  if (await exists(path)) configBackup[name] = await readFile(path, 'utf8');
}

await run('npx', ['vite', 'build', '--mode', 'wechat']);
await mkdir(outputDirectory, { recursive: true });

// The launcher catches failures while evaluating the bundled engine as well
// as asynchronous startup failures, and identifies the exact uploaded build.
await rename(join(outputDirectory, 'game.js'), join(outputDirectory, 'game-runtime.js'));
const runtime = await readFile(join(outputDirectory, 'game-runtime.js'));
let commit = 'unknown';
let dirty = true;
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
try { dirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(); } catch {}
const buildInfo = {
  commit,
  dirty,
  builtAt: new Date().toISOString(),
  runtimeSha256: createHash('sha256').update(runtime).digest('hex'),
};
const launcher = (await readFile('templates/wechat/game.js', 'utf8'))
  .replace('__WECHAT_BUILD_INFO__', JSON.stringify(buildInfo));
await writeFile(join(outputDirectory, 'game.js'), launcher);
await writeFile(join(outputDirectory, 'build-info.json'), JSON.stringify(buildInfo, null, 2) + '\n');

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
  'game-runtime.js',
  'build-info.json',
  'game.json',
  'project.config.json',
  'audio/laser_fire.mp3',
  'audio/coin-pickup.mp3',
  'audio/level-victory.mp3',
  'audio/game-over.mp3',
  'audio/space-loop.mp3',
  'ui/settings-gear.png',
  'ui/space-background.jpg',
  'ui/victory-crown.png',
  'ui/victory-coin.png',
  'ui/heart.png',
  'ui/emitter.png',
  'ui/receiver.png',
  'ui/tutorial/finger.png',
  'ui/app-icon.png',
  'ui/loading-title.png',
  ...['focus','combiner','switch','wall','door','splitter','portal'].map(key=>`ui/mechanisms/${key}.png`),
];
for (const relativePath of requiredFiles) {
  const filePath = join(outputDirectory, relativePath);
  if (!(await exists(filePath))) {
    throw new Error(`WeChat package is missing required file: ${resolve(filePath)}`);
  }
}

await assertNoLocalWebp(join(outputDirectory, 'ui'));

const [packageBytes, audioBytes, uiBytes, scriptBytes] = await Promise.all([
  directorySize(outputDirectory),
  directorySize(join(outputDirectory, 'audio')),
  directorySize(join(outputDirectory, 'ui')),
  Promise.all(['game.js', 'game-runtime.js'].map(name => stat(join(outputDirectory, name))))
    .then(files => files.reduce((sum, info) => sum + info.size, 0)),
]);

console.log('Built WeChat Mini Game package:');
console.log(`  ${resolve(outputDirectory)}`);
console.log(`  source ${buildInfo.commit} · runtime sha256 ${buildInfo.runtimeSha256.slice(0, 12)}`);
console.log(`  audio ${formatMb(audioBytes)} · ui ${formatMb(uiBytes)} · game.js ${formatMb(scriptBytes)}`);
console.log(`  total ${formatMb(packageBytes)} / ${formatMb(WECHAT_MAIN_PACK_LIMIT)} main-package limit`);
console.log('  Open this directory in WeChat DevTools (compileType: game).');

if (packageBytes > WECHAT_MAIN_PACK_LIMIT) {
  throw new Error(
    `WeChat 主包 ${formatMb(packageBytes)} 已超过 4 MB。开发者工具仍可本地预览，但真机预览会失败。请先缩小资源或拆分包。`,
  );
}
