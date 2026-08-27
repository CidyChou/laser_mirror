import { access, mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const projectPath = resolve(process.env.WECHAT_DEVTOOLS_PROJECT || 'dist/wechat');
const defaultCli = platform() === 'darwin'
  ? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
  : '';
const cliPath = process.env.WECHAT_DEVTOOLS_CLI || defaultCli;
const syncMode = process.env.WECHAT_DEVTOOLS_SYNC || 'auto';
const previewMode = (process.env.WECHAT_PREVIEW || '1').toLowerCase();
const wantPreview = previewMode !== '0' && previewMode !== 'false';
const qrOutput = resolve(process.env.WECHAT_PREVIEW_QR || 'dist/wechat-ios-qr.png');
const previewInfoOutput = resolve(process.env.WECHAT_PREVIEW_INFO || 'dist/wechat-preview.json');

await access(join(projectPath, 'game.js'));
await access(join(projectPath, 'project.config.json'));

if (syncMode === '0' || syncMode.toLowerCase() === 'false') {
  console.log('WeChat DevTools sync skipped (WECHAT_DEVTOOLS_SYNC=0).');
  process.exit(0);
}

if (!cliPath) {
  console.log(`WeChat package is ready at ${projectPath}`);
  console.log('WeChat DevTools CLI was not found; open this directory in WeChat DevTools.');
  process.exit(0);
}

try {
  await access(cliPath);
} catch {
  console.log(`WeChat package is ready at ${projectPath}`);
  console.log(`WeChat DevTools CLI was not found at ${cliPath}; open this directory manually.`);
  process.exit(0);
}

function runCli(args, timeoutMs = 12_000) {
  return new Promise((resolveResult) => {
    const child = spawn(cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    const append = (chunk) => {
      output += chunk.toString();
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolveResult({ code: null, output, timedOut: true });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolveResult({ code, output, timedOut: false });
    });

    child.stdin.end('n\n');
  });
}

function printTail(output) {
  const detail = String(output || '')
    .replace(/\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6);
  if (detail.length > 0) console.log(detail.join('\n'));
}

function readAppId(config) {
  const appid = typeof config?.appid === 'string' ? config.appid.trim() : '';
  return appid;
}

const projectConfig = JSON.parse(await readFile(join(projectPath, 'project.config.json'), 'utf8'));
const appid = readAppId(projectConfig);

const openResult = await runCli(['open', '--project', projectPath], 12_000);
if (openResult.code === 0) {
  console.log(`WeChat DevTools opened/synced: ${projectPath}`);
} else {
  console.log(`WeChat package is ready at ${projectPath}`);
  console.log('WeChat DevTools did not accept the automatic sync request.');
  console.log('Enable Settings → Security Settings → Service Port in WeChat DevTools, then rerun make wechat.');
  printTail(openResult.output);
}

if (!wantPreview) {
  console.log('iOS preview skipped (WECHAT_PREVIEW=0).');
  process.exit(0);
}

if (!appid || appid === 'touristappid') {
  console.log('iOS 真机预览需要正式小游戏 AppID。');
  console.log('在微信开发者工具中替换游客 AppID 后，再执行 make wechat。');
  process.exit(0);
}

await mkdir(dirname(qrOutput), { recursive: true });
console.log('Uploading WeChat preview for iOS…');
const previewResult = await runCli([
  'preview',
  '--project', projectPath,
  '--qr-format', 'image',
  '--qr-output', qrOutput,
  '--info-output', previewInfoOutput,
], 90_000);

if (previewResult.code === 0) {
  console.log(`iOS 预览二维码已生成：${qrOutput}`);
  console.log('用手机微信扫码即可打开当前包；不要用开发者工具里上次缓存的预览。');
  process.exit(0);
}

console.log('WeChat preview upload failed. iOS 仍会显示上一次成功预览的旧包。');
printTail(previewResult.output);
if (previewResult.timedOut) {
  console.log('预览命令超时。请确认开发者工具已登录，并已开启服务端口。');
}
process.exit(previewResult.code === 0 ? 0 : 1);
