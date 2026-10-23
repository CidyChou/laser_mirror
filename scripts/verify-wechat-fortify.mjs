import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fortifyWechatProject, fortifySettings, initializeFortify } from '../tools/wechat-fortify.mjs';

const temporary = await mkdtemp(join(tmpdir(), 'laser-mirror-fortify-test-'));
const project = join(temporary, 'project');
const env = { WECHAT_FORTIFY_SECRET: join(temporary, 'credentials/id_rsa.conf') };
const source = '// fixture game\nglobalThis.ready = true;';
const protectedCode = '/* WXAG_OBF_PLUGIN_BY_fixture */ globalThis.ready = true;';
const sourceMap = JSON.stringify({ version: 3, sources: ['game.js'], names: [], mappings: 'AAAA' });
let calls = 0;
async function good(input, output) {
  calls++;
  assert.equal(await readFile(join(input, 'game.js'), 'utf8'), source);
  await writeFile(join(output, 'game.js'), protectedCode);
  await writeFile(join(output, 'game.js.map'), sourceMap);
  return true;
}
async function reset() {
  await writeFile(join(project, 'game.js'), source);
  await rm(join(project, 'game.js.map'), { force: true });
}
try {
  await mkdir(project);
  await writeFile(join(project, 'project.config.json'), '{"appid":"wx1234567890abcdef"}');
  await writeFile(join(project, 'game.json'), '{}');
  const config = { watermark: { files: ['game.js'] }, obfuscation: { tasks: [{ level: 3, files: ['game.js'] }] } };
  const configPath = join(project, 'code.fortify.config.json');
  await writeFile(configPath, JSON.stringify(config));
  await reset();
  await assert.rejects(fortifyWechatProject(project, { env, protect: good }), /尚未初始化/);
  const settings = await initializeFortify(project, env);
  const secret = await readFile(settings.secretPath, 'utf8');
  await initializeFortify(project, env);
  assert.equal(await readFile(settings.secretPath, 'utf8'), secret, 'initialization preserves registered keys');
  assert.equal((await stat(settings.secretPath)).mode & 0o777, 0o600);
  const publicText = await readFile(settings.publicPath, 'utf8');
  assert.equal(publicText, createPublicKey(createPrivateKey(secret.slice(secret.indexOf('-----BEGIN'))))
    .export({ type: 'spki', format: 'pem' }));
  assert.ok(!publicText.includes('PRIVATE'));
  await assert.rejects(fortifySettings(project, { WECHAT_FORTIFY_SECRET: join(project, 'id_rsa.conf') }), /上传目录之外/);
  await assert.rejects(fortifySettings(project, { WECHAT_FORTIFY_SECRET: resolve('tmp/id_rsa.conf') }), /上传目录之外/);
  const alias = join(temporary, 'project-link');
  await symlink(project, alias);
  await assert.rejects(fortifySettings(project, { WECHAT_FORTIFY_SECRET: join(alias, 'keys/id_rsa.conf') }), /上传目录之外/);
  await assert.rejects(fortifySettings(project, { ...env, WECHAT_FORTIFY_TIMEOUT_MINUTES: 'NaN' }), /1–60/);
  await writeFile(settings.secretPath, secret.replace('wx1234567890abcdef', 'wx0000000000000000'));
  await assert.rejects(fortifyWechatProject(project, { env, protect: good }), /AppID.*不一致/);
  await writeFile(settings.secretPath, secret);

  // The caller must await protection; no partial results enter the upload tree.
  let release, started;
  const waiting = new Promise(accept => { release = accept; });
  const entered = new Promise(accept => { started = accept; });
  const pending = fortifyWechatProject(project, { env, protect: async (...args) => {
    started(); await waiting; return good(...args);
  } });
  await entered;
  assert.equal(await readFile(join(project, 'game.js'), 'utf8'), source);
  await assert.rejects(access(join(project, 'game.js.map')), { code: 'ENOENT' });
  await assert.rejects(fortifyWechatProject(project, { env, protect: good }), /已有加固流程/);
  release();
  await pending;
  assert.equal(await readFile(join(project, 'game.js'), 'utf8'), protectedCode);
  await fortifyWechatProject(project, { env, protect: good });
  assert.equal(calls, 1, 'same protected bytes, map, appid and config reuse the completed result');
  await writeFile(configPath, JSON.stringify({ ...config, watermark: { name: 'changed', files: ['game.js'] } }));
  await assert.rejects(fortifyWechatProject(project, { env, protect: good }), /旧加固代码/);
  await writeFile(configPath, JSON.stringify(config));
  await reset();
  await fortifyWechatProject(project, { env, protect: good });
  assert.equal(calls, 2, 'a rebuilt input triggers fresh protection');

  for (const mode of ['false', 'throw', 'missing', 'marker', 'map', 'syntax', 'changed', 'oversize']) {
    await reset();
    await assert.rejects(fortifyWechatProject(project, { env, protect: async (input, output) => {
      if (mode === 'false') return false;
      if (mode === 'throw') throw new Error('network failed');
      if (mode === 'missing') return true;
      await good(input, output);
      if (mode === 'marker') await writeFile(join(output, 'game.js'), source);
      if (mode === 'map') await writeFile(join(output, 'game.js.map'), '{}');
      if (mode === 'syntax') await writeFile(join(output, 'game.js'), '/* WXAG_OBF_PLUGIN_BY_fixture */ const =');
      if (mode === 'changed') await writeFile(join(project, 'game.js'), '// rebuilt during protection');
      if (mode === 'oversize') await writeFile(join(output, 'game.js'), `${protectedCode}\n/*${'x'.repeat(4 * 1024 * 1024)}*/`);
      return true;
    } }), undefined, `${mode} must stop the pipeline`);
    assert.equal(await readFile(join(project, 'game.js'), 'utf8'), mode === 'changed' ? '// rebuilt during protection' : source);
    await assert.rejects(access(join(project, 'game.js.map')), { code: 'ENOENT' });
    await assert.rejects(access(`${project}.fortify-lock`), { code: 'ENOENT' });
  }
  await reset();
  await mkdir(join(project, 'scripts'));
  await writeFile(join(project, 'scripts/extra.js'), '// extra source');
  await writeFile(configPath, JSON.stringify({ watermark: { files: ['game.js', 'scripts/extra.js'] } }));
  await assert.rejects(fortifyWechatProject(project, { env, protect: good }), { code: 'ENOENT' },
    'partial success must not replace any upload-directory file');
  assert.equal(await readFile(join(project, 'game.js'), 'utf8'), source);
  assert.equal(await readFile(join(project, 'scripts/extra.js'), 'utf8'), '// extra source');
  await writeFile(configPath, '{"watermark":{"files":["game.js","../outside.js"]}}');
  await assert.rejects(fortifyWechatProject(project, { env, protect: good }), /相对 .js/);
  const productionConfig = JSON.parse(await readFile('templates/wechat/code.fortify.config.json', 'utf8'));
  const targets = productionConfig.obfuscation.tasks.flatMap(task => task.files);
  assert.deepEqual(targets, ['game.js', 'game-runtime.js', 'runtime-compat.js']);
  for (const file of targets) await writeFile(join(project, file), source);
  await writeFile(configPath, JSON.stringify(productionConfig));
  await fortifyWechatProject(project, { env, protect: async (input, output) => {
    for (const file of targets) {
      assert.equal(await readFile(join(input, file), 'utf8'), source);
      await writeFile(join(output, file), protectedCode);
      await writeFile(join(output, `${file}.map`), sourceMap);
    }
    return true;
  } });
  for (const file of targets) assert.equal(await readFile(join(project, file), 'utf8'), protectedCode);
  const syncEnv = { ...process.env, WECHAT_DEVTOOLS_PROJECT: project, WECHAT_DEVTOOLS_SYNC: '0', WECHAT_FORTIFY: '1', WECHAT_FORTIFY_SECRET: join(temporary, 'absent.conf') };
  const reuse = spawnSync(process.execPath, ['tools/sync-wechat.mjs'], { env: syncEnv, encoding: 'utf8' });
  assert.equal(reuse.status, 0, reuse.stderr);
  assert.match(reuse.stdout, /复用加固产物/);
  await writeFile(join(project, 'game-runtime.js'), source);
  const rejected = spawnSync(process.execPath, ['tools/sync-wechat.mjs'], { env: syncEnv, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0, 'release stops before sync when protection cannot run');
  assert.doesNotMatch(rejected.stdout, /sync skipped/);
  const debug = spawnSync(process.execPath, ['tools/sync-wechat.mjs'], { env: { ...syncEnv, WECHAT_FORTIFY: '0' }, encoding: 'utf8' });
  assert.equal(debug.status, 0, debug.stderr);
  assert.match(debug.stdout, /跳过代码加固/);
  const releaseCommand = execFileSync('make', ['-n', 'wechat'], { encoding: 'utf8' });
  const debugCommand = execFileSync('make', ['-n', 'wechat-debug', 'WECHAT_FORTIFY=1'], { encoding: 'utf8' });
  assert.match(releaseCommand, /WECHAT_FORTIFY="1"/);
  assert.match(debugCommand, /WECHAT_FORTIFY="0"/);
  console.log('WeChat fortification: initialization, wait, lock, reuse, failures and package-size tests passed');
} finally { await rm(temporary, { recursive: true, force: true }); }
