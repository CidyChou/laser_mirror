import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const repository = fileURLToPath(new URL('..', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const inside = (parent, path) => {
  const rel = relative(parent, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
const marker = 'WXAG_OBF_PLUGIN_BY_';
const worker = fileURLToPath(new URL('./wechat-fortify-worker.mjs', import.meta.url));

export async function fortifySettings(project, env = process.env) {
  project = await realpath(project);
  const { appid } = JSON.parse(await readFile(join(project, 'project.config.json'), 'utf8'));
  if (typeof appid !== 'string' || !/^wx[\da-f]{16}$/i.test(appid)) {
    throw new Error('自动加固需要正式小游戏 AppID，请先配置 project.config.json。');
  }
  const secretPath = resolve(env.WECHAT_FORTIFY_SECRET || join(
    homedir(), '.config/laser-mirror/wechat-fortify', appid, 'id_rsa.conf'
  ));
  const timeoutMinutes = Number(env.WECHAT_FORTIFY_TIMEOUT_MINUTES || 10);
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 60) {
    throw new Error('WECHAT_FORTIFY_TIMEOUT_MINUTES 必须为 1–60 分钟的整数。');
  }
  // Resolve symlinked parents too: credentials must never enter a source checkout or upload directory.
  let ancestor = secretPath;
  for (;;) {
    try {
      const canonical = resolve(await realpath(ancestor), relative(ancestor, secretPath));
      if (inside(await realpath(repository), canonical) || inside(project, canonical)) {
        throw new Error('加固私钥必须保存在仓库和小游戏上传目录之外。');
      }
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      ancestor = dirname(ancestor);
    }
  }
  return { project, appid, secretPath, timeoutMinutes };
}

async function readSecret(settings) {
  let text;
  try { text = await readFile(settings.secretPath, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('尚未初始化加固密钥。请执行 make wechat-fortify-init，并在微信后台登记生成的公钥。');
  }
  const appid = text.match(/\[appid\]\s*([^\s\[]+)/)?.[1];
  const key = text.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/)?.[0];
  if (appid !== settings.appid) throw new Error('加固密钥配置中的 AppID 与小游戏不一致。');
  try {
    const privateKey = createPrivateKey(key || '');
    if (privateKey.asymmetricKeyType !== 'rsa') throw new Error();
    return privateKey;
  } catch {
    throw new Error('加固密钥配置中缺少有效的 RSA 私钥。');
  }
}

export async function initializeFortify(project, env = process.env) {
  const settings = await fortifySettings(project, env);
  await mkdir(dirname(settings.secretPath), { recursive: true, mode: 0o700 });
  // Exclusive creation preserves an existing key and its corresponding MP registration.
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  try {
    await writeFile(settings.secretPath, `[appid]\n${settings.appid}\n[private_key]\n${privateKey}`, {
      flag: 'wx', mode: 0o600
    });
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stored = await readSecret(settings);
  const publicPath = join(dirname(settings.secretPath), 'id_rsa.public.pem');
  await writeFile(publicPath, createPublicKey(stored).export({ type: 'spki', format: 'pem' }));
  console.log(`加固密钥已就绪（已有私钥不会覆盖）：${settings.secretPath}`);
  console.log(`请将公钥文件内容登记到微信后台「开发支持 → 研发工具箱 → 密钥管理」：${publicPath}`);
  console.log('登记完成后执行 make wechat，即可自动加固并生成手机预览。');
  return { ...settings, publicPath };
}

function targetFiles(config) {
  if (config.anti_inject?.files?.length) throw new Error('当前官方 CLI 不支持代码防注入配置，请使用插件处理。');
  const files = [...new Set([
    ...(config.watermark?.files || []), ...(config.plugin_protect?.files || []),
    ...(config.obfuscation?.tasks || []).flatMap(task => {
      if (![1, 2, 3].includes(task.level)) throw new Error('无效的加固混淆等级。');
      return task.files || [];
    })
  ])];
  if (!files.includes('game.js')) throw new Error('加固配置必须包含游戏入口 game.js。');
  for (const file of files) {
    if (typeof file !== 'string' || !/\.js$/.test(file) || isAbsolute(file)
      || file.split(/[\\/]/).some(part => part === '..' || part === '')) {
      throw new Error('加固文件必须是项目内的相对 .js 路径。');
    }
  }
  return files;
}

async function fingerprints(project, files) {
  return Object.fromEntries(await Promise.all(files.map(async file => [
    file, hash(await readFile(join(project, file)))
  ])));
}

// Source maps are uploaded for diagnosis but are exempt from WeChat's package limit.
export async function checkFortifiedSize(project, replacements = new Map()) {
  const game = JSON.parse(await readFile(join(project, 'game.json'), 'utf8'));
  const roots = (game.subpackages || []).map(pack => resolve(project, pack.root));
  if (roots.some(root => !inside(project, root) || root === project)) throw new Error('无效的微信分包目录。');
  let main = 0, total = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('微信上传目录中不能包含符号链接。');
      if (entry.isDirectory()) { await walk(path); continue; }
      if (entry.name.endsWith('.map') || entry.name === '.DS_Store') continue;
      const bytes = replacements.get(relative(project, path))?.length ?? (await stat(path)).size;
      total += bytes;
      if (!roots.some(root => inside(root, path))) main += bytes;
    }
  }
  await walk(project);
  if (main > 4 * 1024 * 1024 || total > 30 * 1024 * 1024) {
    throw new Error(`加固后包体超限：主包 ${(main / 1048576).toFixed(2)} MB / 4 MB，总包 ${(total / 1048576).toFixed(2)} MB / 30 MB。停止预览。`);
  }
  console.log(`加固后包体：主包 ${(main / 1048576).toFixed(2)} MB / 4 MB；总包 ${(total / 1048576).toFixed(2)} MB / 30 MB（不含 source map）。`);
  return { main, total };
}

export function runFortifySdk(input, output, settings) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [worker, input, output, settings.secretPath,
      String(settings.timeoutMinutes)], { cwd: dirname(input), stdio: 'inherit' });
    const interrupt = () => child.kill('SIGTERM');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    const timer = setTimeout(() => child.kill('SIGTERM'), (settings.timeoutMinutes * 60 + 30) * 1000);
    const cleanup = () => {
      clearTimeout(timer);
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code, signal) => {
      cleanup();
      if (code === 0) accept(true);
      else reject(new Error(signal ? '微信加固超时或被中断，停止预览。' : '微信加固失败，停止预览。请检查上方官方 CLI 错误。'));
    });
  });
}

export async function fortifyWechatProject(project, { env = process.env, protect = runFortifySdk } = {}) {
  const settings = await fortifySettings(project, env);
  project = settings.project;
  const configPath = join(project, 'code.fortify.config.json');
  const configText = await readFile(configPath, 'utf8');
  const files = targetFiles(JSON.parse(configText));
  const configHash = hash(configText);
  const receiptPath = `${project}.fortify-state.json`;
  const lockPath = `${project}.fortify-lock`;
  try { await mkdir(lockPath); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`已有加固流程在运行。若上次进程异常退出，请确认进程已结束后删除 ${lockPath}`);
  }
  let temporary;
  const heartbeat = setInterval(() => console.log('微信代码加固处理中，完成后才会生成手机预览…'), 25_000);
  try {
    const current = await fingerprints(project, files);
    try {
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      if (receipt.version === 1 && receipt.appid === settings.appid && receipt.configHash === configHash
        && JSON.stringify(receipt.output) === JSON.stringify(await fingerprints(project, files.flatMap(file => [file, `${file}.map`])))) {
        await checkFortifiedSize(project);
        console.log('当前代码及配置与已验证的加固结果一致，复用加固产物。');
        return;
      }
    } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    await readSecret(settings);
    temporary = await mkdtemp(join(tmpdir(), 'laser-mirror-wechat-fortify-'));
    const input = join(temporary, 'input'), output = join(temporary, 'output');
    await mkdir(output);
    for (const file of files) {
      const path = join(project, file);
      if (!inside(project, await realpath(path))) throw new Error('加固文件不能链接到上传目录外。');
      if ((await readFile(path, 'utf8')).includes(marker)) {
        throw new Error('检测到未经当前流程验证的旧加固代码。请执行 make wechat 重新构建，避免重复加固。');
      }
      await mkdir(dirname(join(input, file)), { recursive: true });
      await cp(path, join(input, file));
    }
    await writeFile(join(input, 'code.fortify.config.json'), configText);
    console.log(`开始微信官方加固（最多等待 ${settings.timeoutMinutes} 分钟）…`);
    if (await protect(input, output, settings) !== true) throw new Error('官方加固未成功，停止预览。');
    const replacements = new Map();
    for (const file of files) {
      const code = await readFile(join(output, file));
      const map = await readFile(join(output, `${file}.map`));
      const parsed = JSON.parse(map.toString());
      if (!code.toString().includes(marker) || hash(code) === current[file]
        || parsed.version !== 3 || !Array.isArray(parsed.sources) || !parsed.sources.length
        || typeof parsed.mappings !== 'string' || !parsed.mappings.length) {
        throw new Error(`加固结果不完整：${file} 缺少保护标记或有效 source map。停止预览。`);
      }
      new Script(code.toString(), { filename: file });
      replacements.set(file, code);
      replacements.set(`${file}.map`, map);
    }
    if (JSON.stringify(current) !== JSON.stringify(await fingerprints(project, files))
      || configHash !== hash(await readFile(configPath))) {
      throw new Error('等待加固期间代码或配置发生变化，请重新执行 make wechat。');
    }
    await checkFortifiedSize(project, replacements);
    // No upload-directory files are changed until every result has passed validation.
    for (const [file, bytes] of replacements) await writeFile(join(project, file), bytes);
    await writeFile(receiptPath, `${JSON.stringify({ version: 1, appid: settings.appid, configHash,
      output: await fingerprints(project, files.flatMap(file => [file, `${file}.map`])) })}\n`);
    console.log('微信代码加固完成，所有文件及 source map 已验证。');
  } finally {
    clearInterval(heartbeat);
    if (temporary) await rm(temporary, { recursive: true, force: true });
    await rm(lockPath, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const project = resolve(process.env.WECHAT_DEVTOOLS_PROJECT || 'dist/wechat');
    if (process.argv.includes('--init')) await initializeFortify(project);
    else await fortifyWechatProject(project);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
