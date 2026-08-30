import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { canonicalize, hydrateLevels, toGameLevel, validateLevels, type GmLevel, type GmStoreFile } from './schema';

export function gmApiPlugin(projectRoot: string): Plugin {
  return {
    name: 'laser-gm-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/api/')) return next();
        void handle(projectRoot, req, res).catch(error => {
          send(res, 500, { error: error instanceof Error ? error.message : String(error) });
        });
      });
    },
  };
}

async function handle(projectRoot: string, req: IncomingMessage, res: ServerResponse) {
  const url = req.url?.split('?')[0] ?? '';
  const method = req.method ?? 'GET';
  const paths = pathsFor(projectRoot);

  if (method === 'GET' && url === '/api/state') {
    const store = loadStore(paths);
    const project = readProject(paths);
    send(res, 200, {
      levels: store.levels,
      dirty: canonicalize(store.levels) !== canonicalize(project.map((level, index) => ({ ...level, id: `p-${index}` }))),
      projectCount: project.length,
      dataPath: 'tools/gm/data/levels.json',
      exportPath: 'src/levels/levels.json',
      issues: validateLevels(store.levels),
    });
    return;
  }

  if (method === 'PUT' && url === '/api/levels') {
    const body = await readJson(req);
    const levels = hydrateLevels(body?.levels ?? body);
    saveStore(paths, { version: 1, levels });
    send(res, 200, { ok: true, count: levels.length, issues: validateLevels(levels) });
    return;
  }

  if (method === 'POST' && url === '/api/export') {
    const store = loadStore(paths);
    const issues = validateLevels(store.levels).filter(issue => issue.fatal);
    if (issues.length) {
      send(res, 400, { ok: false, error: '关卡配置未通过校验，已阻止导出', issues });
      return;
    }
    const json = canonicalize(store.levels);
    atomicWrite(paths.projectFile, json);
    const check = spawnSync(process.execPath, [resolve(projectRoot, 'scripts/validate-levels.mjs')], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    if (check.status !== 0) {
      send(res, 400, {
        ok: false,
        error: check.stderr || check.stdout || '导出后校验失败',
        issues,
      });
      return;
    }
    send(res, 200, {
      ok: true,
      count: store.levels.length,
      exportPath: 'src/levels/levels.json',
      message: check.stdout.trim(),
    });
    return;
  }

  if (method === 'POST' && url === '/api/reset') {
    const project = readProject(paths);
    const levels = project.map(level => ({ ...level, id: crypto.randomUUID() }));
    saveStore(paths, { version: 1, levels });
    send(res, 200, { ok: true, levels, count: levels.length });
    return;
  }

  send(res, 404, { error: `Unknown API ${method} ${url}` });
}

function pathsFor(projectRoot: string) {
  const dataDir = resolve(projectRoot, 'tools/gm/data');
  return {
    projectRoot,
    dataDir,
    dataFile: resolve(dataDir, 'levels.json'),
    projectFile: resolve(projectRoot, 'src/levels/levels.json'),
  };
}

type Paths = ReturnType<typeof pathsFor>;

function loadStore(paths: Paths): GmStoreFile {
  mkdirSync(paths.dataDir, { recursive: true });
  if (!existsSync(paths.dataFile)) {
    const levels = readProject(paths).map(level => ({ ...level, id: crypto.randomUUID() }));
    const store: GmStoreFile = { version: 1, levels };
    saveStore(paths, store);
    return store;
  }
  try {
    const parsed = JSON.parse(readFileSync(paths.dataFile, 'utf8')) as unknown;
    const levels = hydrateLevels(parsed);
    if (!levels.length) {
      const seeded = readProject(paths).map(level => ({ ...level, id: crypto.randomUUID() }));
      const store: GmStoreFile = { version: 1, levels: seeded };
      saveStore(paths, store);
      return store;
    }
    return { version: 1, levels };
  } catch {
    const backup = `${paths.dataFile}.bak-${Date.now()}`;
    try { renameSync(paths.dataFile, backup); } catch { /* ignore */ }
    const levels = readProject(paths).map(level => ({ ...level, id: crypto.randomUUID() }));
    const store: GmStoreFile = { version: 1, levels };
    saveStore(paths, store);
    return store;
  }
}

function saveStore(paths: Paths, store: GmStoreFile) {
  mkdirSync(paths.dataDir, { recursive: true });
  atomicWrite(paths.dataFile, `${JSON.stringify({ version: 1, levels: store.levels }, null, 2)}\n`);
}

function readProject(paths: Paths): Array<ReturnType<typeof toGameLevel>> {
  const raw = JSON.parse(readFileSync(paths.projectFile, 'utf8')) as unknown;
  return hydrateLevels(raw).map(toGameLevel);
}

function atomicWrite(file: string, contents: string) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, file);
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readJson(req: IncomingMessage): Promise<any> {
  const text = await readBody(req);
  if (!text) return {};
  return JSON.parse(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function ensureGmStore(projectRoot: string): { levels: GmLevel[] } {
  return loadStore(pathsFor(projectRoot));
}
