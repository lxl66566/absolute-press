import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { afterAll, describe, expect, it, vi } from 'vitest';

import type { AbsolutePressConfig } from '../../config.ts';
import { devFsUrl } from '../assets.ts';
import { clientEntry, packageRoot } from '../clientEntry.ts';
import { absolutePress, debounceTrailing } from '../plugin.ts';

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(
    tmpDirs.map(dir => rm(dir, { recursive: true, force: true })),
  );
});

async function makeTmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

const toPosix = (p: string): string => p.split(path.sep).join('/');

function userConfig(
  extra: Partial<AbsolutePressConfig> = {},
): AbsolutePressConfig {
  return {
    contentDir: 'content',
    title: 'Site',
    description: 'desc',
    hostname: 'https://test.example.com',
    ...extra,
  };
}

/** The plugin goes inert under vitest (it reads process.env.VITEST at
 * factory time); scrub it just long enough to create a live instance. */
function livePlugin(cfg: AbsolutePressConfig): Plugin {
  const prev = process.env.VITEST;
  delete process.env.VITEST;
  try {
    return absolutePress(cfg);
  } finally {
    if (prev !== undefined) process.env.VITEST = prev;
  }
}

/** Invoke a vite plugin hook with a stubbed `this`. The hook type is
 * normalized to a this-less signature (`never[]` args keep call-site arg
 * checking); the stub only implements the members the hook body touches. */
function callHook<R>(
  hook:
    | ((...args: never[]) => R)
    | { handler?: (...args: never[]) => R }
    | undefined,
  thisArg: object,
  ...args: unknown[]
): R | undefined {
  const fn = typeof hook === 'function' ? hook : hook?.handler;
  return fn?.apply(thisArg, args as never[]);
}

/** Full ConfigEnv for the config hook (it also reads `mode`). */
const hookEnv = (command: 'build' | 'serve'): ConfigEnv => ({
  command,
  mode: command === 'build' ? 'production' : 'development',
});

function runConfig(
  plugin: Plugin,
  cfg: UserConfig,
  env: ConfigEnv,
): Partial<UserConfig> {
  const out = callHook(plugin.config, {}, cfg, env);
  if (out === undefined || out === null || out instanceof Promise) {
    throw new Error('config hook produced no sync result');
  }
  return out;
}

interface TestBundleEntry {
  type: 'chunk' | 'asset';
  fileName: string;
  isEntry?: boolean;
  [meta: string]: unknown;
}

function bundleOf(entries: TestBundleEntry[]): Record<string, TestBundleEntry> {
  return Object.fromEntries(entries.map(e => [e.fileName, e]));
}

interface EmittedAsset {
  fileName: string;
  source: string | Buffer;
}

interface StubBuildCtx {
  emitted: EmittedAsset[];
  error(message: string): never;
  emitFile(file: { type: 'asset'; fileName: string; source: string }): void;
}

function stubBuildCtx(): StubBuildCtx {
  const emitted: EmittedAsset[] = [];
  return {
    emitted,
    // Mirrors vite's this.error: fails the build hook with the message.
    error(message: string): never {
      throw new Error(message);
    },
    emitFile(file: { type: 'asset'; fileName: string; source: string }): void {
      emitted.push({ fileName: file.fileName, source: file.source });
    },
  };
}

/** Drive the build-side hook sequence: config -> configResolved -> buildStart. */
async function buildSidePlugin(
  root: string,
  cfg: AbsolutePressConfig = userConfig(),
): Promise<Plugin> {
  const plugin = livePlugin(cfg);
  runConfig(plugin, { root }, hookEnv('build'));
  callHook(plugin.configResolved, {}, { root });
  await callHook(plugin.buildStart, {});
  return plugin;
}

function emittedHtml(emitted: EmittedAsset[], fileName: string): string {
  const file = emitted.find(f => f.fileName === fileName);
  expect(file, `no emitted file ${fileName}`).toBeDefined();
  return String(file?.source ?? '');
}

/** Standard exports map: browser(.development) branch + package.json. */
const browserExports = {
  '.': {
    browser: {
      development: { default: './dist/web.dev.js' },
      default: './dist/web.js',
    },
  },
  './package.json': './package.json',
};

async function writePackage(dir: string, pkg: object): Promise<string> {
  const pkgDir = path.join(dir, 'node_modules', '@solidjs', 'web');
  await mkdir(pkgDir, { recursive: true });
  await writeFile(path.join(pkgDir, 'package.json'), JSON.stringify(pkg));
  return pkgDir;
}

async function writePluginStub(dir: string): Promise<void> {
  await mkdir(path.join(dir, 'node_modules', 'vite-plugin-solid'), {
    recursive: true,
  });
  await writeFile(
    path.join(dir, 'node_modules/vite-plugin-solid/index.mjs'),
    '',
  );
}

function webAlias(out: Partial<UserConfig>): { replacement: string } {
  const alias = out.resolve?.alias;
  if (!Array.isArray(alias)) {
    throw new Error('no alias array in resolved config');
  }
  const entry = alias.find(
    a => typeof a === 'object' && a.find instanceof RegExp,
  );
  expect(entry, 'no regex alias for @solidjs/web').toBeDefined();
  expect(entry?.find).toBeInstanceOf(RegExp);
  return entry as { replacement: string };
}

// -- config hook -------------------------------------------------------------

describe('absolutePress config hook', () => {
  it('selects the custom app type and the real client entry input', async () => {
    const root = await makeTmp('ap-plugin-');
    const out = runConfig(livePlugin(userConfig()), { root }, hookEnv('build'));
    expect(out.appType).toBe('custom');
    expect(out.build?.rollupOptions?.input).toBe(clientEntry());
  });

  it('drops the default fs.allow when the user brings an explicit list', async () => {
    const root = await makeTmp('ap-plugin-');
    // Vite concatenates this fragment onto the user's own fs.allow at
    // mergeConfig time, so with an explicit user list the hook only
    // contributes the package root.
    const out = runConfig(
      livePlugin(userConfig()),
      { root, server: { fs: { allow: ['/custom/dir'] } } },
      hookEnv('build'),
    );
    expect(out.server?.fs?.allow).toEqual([packageRoot()]);
  });

  it('re-adds the workspace default when no user fs.allow is set', async () => {
    const root = await makeTmp('ap-plugin-');
    const out = runConfig(livePlugin(userConfig()), { root }, hookEnv('build'));
    const allow = out.server?.fs?.allow;
    expect(allow).toHaveLength(2);
    expect(allow?.at(-1)).toBe(packageRoot());
  });

  describe('@solidjs/web alias resolution', () => {
    it('picks the browser development file in dev and prod file in build', async () => {
      const root = await makeTmp('ap-alias-');
      const pkgDir = await writePackage(root, {
        name: '@solidjs/web',
        exports: browserExports,
      });
      const serve = runConfig(
        livePlugin(userConfig()),
        { root },
        hookEnv('serve'),
      );
      expect(webAlias(serve).replacement).toBe(
        path.join(pkgDir, 'dist/web.dev.js'),
      );
      const build = runConfig(
        livePlugin(userConfig()),
        { root },
        hookEnv('build'),
      );
      expect(webAlias(build).replacement).toBe(
        path.join(pkgDir, 'dist/web.js'),
      );
    });

    it('falls back to the legacy unpkg field without a browser branch', async () => {
      const root = await makeTmp('ap-alias-');
      const pkgDir = await writePackage(root, {
        name: '@solidjs/web',
        unpkg: './dist/web.js',
      });
      const out = runConfig(
        livePlugin(userConfig()),
        { root },
        hookEnv('serve'),
      );
      expect(webAlias(out).replacement).toBe(path.join(pkgDir, 'dist/web.js'));
    });

    it('lands on the package root as the last resort', async () => {
      const root = await makeTmp('ap-alias-');
      const pkgDir = await writePackage(root, {
        name: '@solidjs/web',
        main: './dist/server.js',
      });
      const out = runConfig(
        livePlugin(userConfig()),
        { root },
        hookEnv('build'),
      );
      expect(webAlias(out).replacement).toBe(pkgDir);
    });

    it('resolves through the vite-plugin-solid chain when not hoisted', async () => {
      const root = await makeTmp('ap-alias-');
      // Legacy pnpm layout: @solidjs/web only exists nested under the
      // solid plugin's own dependency tree.
      const nestedPkgDir = path.join(
        root,
        'node_modules/vite-plugin-solid/node_modules/@solidjs/web',
      );
      await mkdir(nestedPkgDir, { recursive: true });
      await writeFile(
        path.join(nestedPkgDir, 'package.json'),
        JSON.stringify({ name: '@solidjs/web', unpkg: './nested.js' }),
      );
      await writePluginStub(root);
      const out = runConfig(
        livePlugin(userConfig()),
        { root },
        hookEnv('build'),
      );
      expect(webAlias(out).replacement).toBe(
        path.join(nestedPkgDir, 'nested.js'),
      );
    });

    it('prefers the direct dependency over the transitive one', async () => {
      const root = await makeTmp('ap-alias-');
      const directPkgDir = await writePackage(root, {
        name: '@solidjs/web',
        unpkg: './direct.js',
      });
      const nestedPkgDir = path.join(
        root,
        'node_modules/vite-plugin-solid/node_modules/@solidjs/web',
      );
      await mkdir(nestedPkgDir, { recursive: true });
      await writeFile(
        path.join(nestedPkgDir, 'package.json'),
        JSON.stringify({ name: '@solidjs/web', unpkg: './nested.js' }),
      );
      await writePluginStub(root);
      const out = runConfig(
        livePlugin(userConfig()),
        { root },
        hookEnv('build'),
      );
      expect(webAlias(out).replacement).toBe(
        path.join(directPkgDir, 'direct.js'),
      );
    });

    it('stays empty when nothing is resolvable', async () => {
      const root = await makeTmp('ap-alias-');
      const out = runConfig(
        livePlugin(userConfig()),
        { root },
        hookEnv('build'),
      );
      expect(out.resolve?.alias).toEqual([]);
    });

    it('stays empty when the found package hides package.json behind exports', async () => {
      const root = await makeTmp('ap-alias-');
      // exports without './package.json': the direct probe fails, and no
      // plugin chain exists either — alias resolution must not throw.
      await writePackage(root, {
        name: '@solidjs/web',
        exports: { '.': { default: './dist/web.js' } },
      });
      const out = runConfig(
        livePlugin(userConfig()),
        { root },
        hookEnv('build'),
      );
      expect(out.resolve?.alias).toEqual([]);
    });
  });
});

// -- virtual islands module --------------------------------------------------

describe('absolutePress virtual islands module', () => {
  const VIRTUAL_ID = 'virtual:absolute-press/islands';
  const RESOLVED_ID = '\0virtual:absolute-press/islands';

  it('maps the virtual id and passes others through', async () => {
    await makeTmp('ap-islands-');
    const plugin = livePlugin(userConfig());
    expect(callHook(plugin.resolveId, {}, VIRTUAL_ID)).toBe(RESOLVED_ID);
    expect(callHook(plugin.resolveId, {}, './other.ts')).toBeNull();
  });

  it('emits build-mode imports as posix fs paths', async () => {
    const root = await makeTmp('ap-islands-');
    const plugin = livePlugin(
      userConfig({ islands: { MyWidget: 'islands/w.tsx' } }),
    );
    runConfig(plugin, { root }, hookEnv('build'));
    callHook(plugin.configResolved, {}, { root });
    const code = callHook(plugin.load, {}, RESOLVED_ID);
    const abs = toPosix(path.resolve(root, 'islands/w.tsx'));
    expect(code).toBe(
      `import I0 from "${abs}";\nexport default { "MyWidget": I0 };\n`,
    );
    expect(callHook(plugin.load, {}, '/real/module.ts')).toBeNull();
  });

  it('emits dev-mode imports as /@fs/ urls', async () => {
    const root = await makeTmp('ap-islands-');
    const plugin = livePlugin(
      userConfig({ islands: { MyWidget: 'islands/w.tsx' } }),
    );
    runConfig(plugin, { root }, hookEnv('serve'));
    callHook(plugin.configResolved, {}, { root });
    const code = callHook(plugin.load, {}, RESOLVED_ID);
    expect(code).toBe(
      `import I0 from "${devFsUrl(path.resolve(root, 'islands/w.tsx'))}";\n` +
        `export default { "MyWidget": I0 };\n`,
    );
  });
});

// -- virtual site-data module ------------------------------------------------

describe('absolutePress virtual site-data module', () => {
  const VIRTUAL_ID = 'virtual:absolute-press/site-data';
  const RESOLVED_ID = '\0virtual:absolute-press/site-data';

  it('maps the virtual id even without an onScan hook', async () => {
    await makeTmp('ap-sitedata-');
    const plugin = livePlugin(userConfig());
    expect(callHook(plugin.resolveId, {}, VIRTUAL_ID)).toBe(RESOLVED_ID);
    expect(callHook(plugin.resolveId, {}, './other.ts')).toBeNull();
  });

  it('serializes the onScan result after the build sync', async () => {
    const root = await makeTmp('ap-sitedata-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(path.join(root, 'content', 'index.md'), '# Home\n');
    const plugin = await buildSidePlugin(
      root,
      userConfig({ onScan: () => ({ pages: 1 }) }),
    );
    await expect(callHook(plugin.load, {}, RESOLVED_ID)).resolves.toBe(
      'export default {"pages":1};\n',
    );
  });

  it('emits the undefined literal when the hook returns nothing', async () => {
    const root = await makeTmp('ap-sitedata-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(path.join(root, 'content', 'index.md'), '# Home\n');
    const plugin = await buildSidePlugin(
      root,
      userConfig({ onScan: () => undefined }),
    );
    await expect(callHook(plugin.load, {}, RESOLVED_ID)).resolves.toBe(
      'export default undefined;\n',
    );
  });

  it('fails the load with guidance when no onScan hook is configured', async () => {
    const root = await makeTmp('ap-sitedata-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(path.join(root, 'content', 'index.md'), '# Home\n');
    const plugin = await buildSidePlugin(root);
    await expect(callHook(plugin.load, {}, RESOLVED_ID)).rejects.toThrowError(
      /virtual:absolute-press\/site-data[\s\S]*onScan/,
    );
  });

  it('gates load on the first dev sync', async () => {
    const { plugin } = await devFixture(
      { 'index.md': '# Home\n' },
      userConfig({ onScan: () => ({ ready: true }) }),
    );
    // configureServer starts the sync; only its side effects matter here.
    stubServer(plugin);
    // Called while the initial sync is still in flight: without the gate
    // siteData is still undefined and the module would emit `undefined`.
    await expect(callHook(plugin.load, {}, RESOLVED_ID)).resolves.toBe(
      'export default {"ready":true};\n',
    );
  });
});

// -- dev server --------------------------------------------------------------

interface WsMessage {
  type: string;
  err?: { message: string; stack?: string };
}

interface StubRes {
  readonly body: string | undefined;
  readonly headers: Record<string, string>;
  setHeader(key: string, value: string): void;
  end(body?: string): void;
}

function stubRes(): StubRes {
  const state: { body?: string; headers: Record<string, string> } = {
    headers: {},
  };
  return {
    get body() {
      return state.body;
    },
    get headers() {
      return state.headers;
    },
    setHeader(key: string, value: string): void {
      state.headers[key] = value;
    },
    end(body?: string): void {
      state.body = body;
    },
  };
}

interface DevServerStub {
  readonly watched: string[];
  readonly sent: WsMessage[];
  readonly transformCalls: string[];
  /** id -> registered module node (moduleGraph fixture). */
  readonly modules: Map<string, { id: string }>;
  /** module ids passed to moduleGraph.invalidateModule, in order. */
  readonly invalidated: string[];
  /** event name -> registered watcher callback (one per event). */
  readonly handlers: Map<string, (file: string) => void>;
  /** event name -> httpServer close handlers (dev-server cleanup hooks). */
  readonly httpCloseHandlers: Map<string, () => void>;
  fire(event: 'change' | 'add' | 'unlink', file: string): void;
  middleware:
    | ((
        req: { method?: string; url?: string },
        res: StubRes,
        next: (err?: unknown) => void,
      ) => void)
    | undefined;
  transformRequest(url: string): Promise<{ code: string } | null>;
  /** Install a fake transformRequest: url -> module code (null = no module). */
  transformBy(
    map: Record<string, string>,
    opts?: { failFirst?: boolean },
  ): void;
}

function stubServer(plugin: Plugin): DevServerStub {
  const stub: DevServerStub = {
    watched: [],
    sent: [],
    transformCalls: [],
    modules: new Map(),
    invalidated: [],
    handlers: new Map(),
    httpCloseHandlers: new Map(),
    fire(event, file) {
      stub.handlers.get(event)?.(file);
    },
    middleware: undefined,
    transformRequest: async () => null,
    transformBy(map, opts = {}) {
      let calls = 0;
      stub.transformRequest = async (url: string) => {
        stub.transformCalls.push(url);
        if (opts.failFirst === true && calls++ === 0) {
          throw new Error('transform exploded');
        }
        const code = map[url];
        return code === undefined ? null : { code };
      };
    },
  };
  const server = {
    config: { base: '/' },
    httpServer: {
      once: (event: string, cb: () => void) => {
        stub.httpCloseHandlers.set(event, cb);
      },
    },
    watcher: {
      add: (p: string) => stub.watched.push(p),
      on: (event: string, cb: (file: string) => void) => {
        stub.handlers.set(event, cb);
      },
    },
    ws: { send: (payload: WsMessage) => stub.sent.push(payload) },
    middlewares: {
      use: (fn: DevServerStub['middleware']) => {
        stub.middleware = fn;
      },
    },
    moduleGraph: {
      getModuleById: (id: string): { id: string } | undefined =>
        stub.modules.get(id),
      invalidateModule: (mod: { id: string }): void => {
        stub.invalidated.push(mod.id);
      },
    },
    // Indirection: transformBy swaps stub.transformRequest later.
    transformRequest: (url: string) => stub.transformRequest(url),
  };
  const post = callHook(plugin.configureServer, {}, server);
  // The returned post hook installs the page middleware.
  if (typeof post === 'function') post();
  return stub;
}

interface Handled {
  res: StubRes;
  nextCalls: unknown[];
}

function callMiddleware(
  server: DevServerStub,
  url: string,
  method = 'GET',
): Handled {
  const res = stubRes();
  const nextCalls: unknown[] = [];
  server.middleware?.({ method, url }, res, err => {
    nextCalls.push(err);
  });
  return { res, nextCalls };
}

async function waitHandled(handled: Handled): Promise<void> {
  // The first request builds the markdown renderer (shiki et al), which can
  // take well past waitFor's 1s default.
  await vi.waitFor(
    () => {
      if (handled.res.body === undefined && handled.nextCalls.length === 0) {
        throw new Error('request not handled yet');
      }
    },
    { timeout: 30_000, interval: 50 },
  );
}

async function devFixture(
  files: Record<string, string>,
  cfg: AbsolutePressConfig = userConfig(),
): Promise<{ plugin: Plugin; root: string }> {
  const root = await makeTmp('ap-dev-');
  await Promise.all(
    Object.entries(files).map(async ([rel, body]) => {
      await mkdir(path.dirname(path.join(root, 'content', rel)), {
        recursive: true,
      });
      await writeFile(path.join(root, 'content', rel), body);
    }),
  );
  const plugin = livePlugin(cfg);
  runConfig(plugin, { root }, hookEnv('serve'));
  callHook(plugin.configResolved, {}, { root });
  return { plugin, root };
}

describe('absolutePress dev server', () => {
  it('watches the content dir and reloads on md edits only', async () => {
    const { plugin, root } = await devFixture({ 'index.md': '# Home\n' });
    const server = stubServer(plugin);
    expect(server.watched).toEqual([path.join(root, 'content')]);

    server.fire('change', path.join(root, 'content', 'index.md'));
    await vi.waitFor(() => expect(server.sent).toHaveLength(1), {
      timeout: 30_000,
      interval: 50,
    });
    expect(server.sent[0]).toMatchObject({ type: 'full-reload' });

    // Non-markdown and out-of-content files never trigger a reload.
    server.sent.length = 0;
    server.fire('change', path.join(root, 'content', 'img.png'));
    server.fire('change', path.join(root, 'other.md'));
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(server.sent).toHaveLength(0);
  });

  it('reloads on structural changes', async () => {
    const { plugin, root } = await devFixture({ 'index.md': '# Home\n' });
    const server = stubServer(plugin);
    // The path need not exist on disk; resync just rescans the tree.
    server.fire('add', path.join(root, 'content', 'new.md'));
    await vi.waitFor(() => expect(server.sent).toHaveLength(1), {
      timeout: 30_000,
      interval: 50,
    });
    expect(server.sent[0]).toMatchObject({ type: 'full-reload' });
  });

  it('merges structural event bursts into one resync reload', async () => {
    const { plugin, root } = await devFixture({ 'index.md': '# Home\n' });
    const server = stubServer(plugin);
    // A git-checkout-style burst: one debounced resync must follow, and
    // exactly one (the trailing call always runs).
    server.fire('add', path.join(root, 'content', 'a.md'));
    server.fire('unlink', path.join(root, 'content', 'b.md'));
    server.fire('add', path.join(root, 'content', 'c.md'));
    await vi.waitFor(() => expect(server.sent).toHaveLength(1), {
      timeout: 30_000,
      interval: 50,
    });
    // Nothing else may follow once the trailing resync fired.
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(server.sent).toHaveLength(1);
    expect(server.sent[0]).toMatchObject({ type: 'full-reload' });
  });

  it('warns about archive route collisions on dev sync without failing', async () => {
    // A category archive colliding with the page of the same name: build
    // errors on this, dev must warn and keep serving.
    const { plugin, root } = await devFixture({
      'post.md': '---\ncategory:\n  - news\n---\n\n# Post\n',
      'category/news.md': '# News\n',
    });
    // Installed before stubServer: the initial sync starts in
    // configureServer and emits the warning asynchronously.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const server = stubServer(plugin);
      const page = callMiddleware(server, '/category/news');
      await waitHandled(page);
      // The page wins the route in dev: served, not a 500.
      expect(page.res.body).toContain('News');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
        'duplicate route /category/news',
      );

      // An unrelated structural resync must not re-print the same warning.
      warnSpy.mockClear();
      server.fire('add', path.join(root, 'content', 'other.md'));
      await vi.waitFor(
        () => expect(server.sent).toContainEqual({ type: 'full-reload' }),
        { timeout: 30_000, interval: 50 },
      );
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns once about the served page dead links in dev', async () => {
    // Build fails on dead links in generateBundle; dev must surface them at
    // request time instead of staying silent until the next build.
    const { plugin } = await devFixture({ 'a.md': '[dead](./missing.md)\n' });
    const server = stubServer(plugin);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const first = callMiddleware(server, '/a');
      await waitHandled(first);
      // The page still ships.
      expect(first.res.body).toContain('dead');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('1 dead link(s) in');

      // The second request of the same page does not re-warn.
      const second = callMiddleware(server, '/a');
      await waitHandled(second);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('cancels the pending structural resync when the server closes', async () => {
    const { plugin, root } = await devFixture({ 'index.md': '# Home\n' });
    const server = stubServer(plugin);
    server.fire('add', path.join(root, 'content', 'a.md'));
    // httpServer close is the dev-server cleanup hook for the debounce timer.
    const cancel = server.httpCloseHandlers.get('close');
    expect(cancel).toBeTypeOf('function');
    cancel?.();
    // The debounce window passes after close: no resync, no reload broadcast.
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(server.sent).toHaveLength(0);
  });

  it('survives resync failures and reports them over ws instead of crashing', async () => {
    const { plugin, root } = await devFixture({ 'index.md': '# Home\n' });
    const server = stubServer(plugin);
    // Flush the initial sync before breaking the page set.
    await waitHandled(callMiddleware(server, '/'));

    // guide/index.md + guide/README.md normalize to one route: scanPages
    // throws during resync.
    await mkdir(path.join(root, 'content', 'guide'), { recursive: true });
    await writeFile(path.join(root, 'content', 'guide', 'index.md'), '# G\n');
    await writeFile(path.join(root, 'content', 'guide', 'README.md'), '# G\n');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      server.fire('add', path.join(root, 'content', 'guide', 'README.md'));
      await vi.waitFor(() => expect(server.sent).toHaveLength(1), {
        timeout: 30_000,
        interval: 50,
      });
      // Assert inside try: mockRestore() wipes the recorded calls.
      expect(errSpy).toHaveBeenCalledWith(
        '[absolute-press] dev resync failed',
        expect.anything(),
      );
    } finally {
      errSpy.mockRestore();
    }
    expect(server.sent[0]).toMatchObject({ type: 'error' });
    expect(server.sent[0]?.err?.message).toContain('duplicate route');
    expect(server.sent[0]?.err?.stack).toBeTruthy();
  });

  it('serves rss.xml, page routes and passes unknown urls through', async () => {
    const { plugin } = await devFixture({
      'index.md': '# Home\n',
      'guide/index.md': '# G\n',
      'guide/a.md': '[back](./index.md)\n',
    });
    const server = stubServer(plugin);

    const rss = callMiddleware(server, '/rss.xml');
    await waitHandled(rss);
    expect(rss.res.headers['content-type']).toContain('xml');
    expect(rss.res.body).toContain('<rss');

    const page = callMiddleware(server, '/guide/a');
    await waitHandled(page);
    expect(page.res.headers['content-type']).toContain('text/html');
    expect(page.res.body).toContain('id="__AP_DATA__"');
    // Internal link rewritten page-relative; ./index.md resolves to the
    // sibling directory index (guide/index.md -> the clean route /guide/).
    expect(page.res.body).toContain('<a href="./">back</a>');
    // Dev pages embed the framework entry as a /@fs/ module url.
    expect(page.res.body).toContain(
      `<script type="module" src="${devFsUrl(clientEntry())}">`,
    );
    // Middleware output bypasses vite's HTML transform, so the HMR client
    // must be injected into the head itself (full-reload receiver).
    expect(page.res.body).toContain(
      '<script type="module" src="/@vite/client"></script>',
    );

    const slash = callMiddleware(server, '/guide/');
    await waitHandled(slash);
    expect(slash.res.body).toBeDefined();

    const unknown = callMiddleware(server, '/nope');
    await waitHandled(unknown);
    expect(unknown.res.body).toBeUndefined();
    expect(unknown.nextCalls).toHaveLength(1);
    expect(unknown.nextCalls[0]).toBeUndefined();

    const posted = callMiddleware(server, '/', 'POST');
    await waitHandled(posted);
    expect(posted.nextCalls).toHaveLength(1);
  });

  it('collects the entry css graph in dev and injects render-blocking links', async () => {
    const { plugin } = await devFixture({ 'index.md': '# Home\n' });
    const server = stubServer(plugin);
    const appSrc = `${toPosix(path.resolve(packageRoot(), 'src'))}/`;
    server.transformBy({
      [devFsUrl(clientEntry())]: [
        'import "/src/theme.css";',
        'import uno from "/src/uno.css";',
        'import "/src/app.tsx";',
        // Vendored / non-app deps are never followed...
        'import "mermaid/dist/mermaid.js";',
        'import "/@vite/client";',
        // ...and dynamic imports never match the static-import heuristic.
        'const lazy = () => import("./lazy.css");',
        // A malformed /@fs/ url (bad percent-escape) is dropped, not fatal.
        'import "/@fs/C:/bad/%zz/app.js";',
      ].join('\n'),
      '/src/app.tsx': `import "/src/sidebar.css";\nimport "/@fs/${appSrc}vendor.css";`,
    });

    const page = callMiddleware(server, '/');
    await waitHandled(page);

    const html = page.res.body ?? '';
    expect(html).toContain(
      '<link rel="stylesheet" href="/src/theme.css?direct">',
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="/src/uno.css?direct">',
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="/src/sidebar.css?direct">',
    );
    expect(html).toContain(
      `<link rel="stylesheet" href="/@fs/${appSrc}vendor.css?direct">`,
    );

    // Only app modules of the entry's static graph are transformed.
    expect(server.transformCalls).toContain('/src/app.tsx');
    expect(server.transformCalls).not.toContain('mermaid/dist/mermaid.js');
    expect(server.transformCalls).not.toContain('/@vite/client');
    expect(server.transformCalls).not.toContain('/@fs/C:/bad/%zz/app.js');
    expect(server.transformCalls.join('\n')).not.toContain('lazy.css');
  });

  it('does not cache css collection failures and retries on the next request', async () => {
    const { plugin } = await devFixture({ 'index.md': '# Home\n' });
    const server = stubServer(plugin);
    server.transformBy(
      { [devFsUrl(clientEntry())]: 'import "/src/theme.css";' },
      {
        failFirst: true,
      },
    );

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // First request: transform fails, the page still ships (raw html).
      const first = callMiddleware(server, '/');
      await waitHandled(first);
      expect(first.res.body).not.toContain('/src/theme.css');
      expect(errSpy).toHaveBeenCalledWith(
        '[absolute-press] dev css head injection failed',
        expect.anything(),
      );

      // Second request retries from scratch (failure was not cached).
      const second = callMiddleware(server, '/');
      await waitHandled(second);
      expect(second.res.body).toContain(
        '<link rel="stylesheet" href="/src/theme.css?direct">',
      );
    } finally {
      errSpy.mockRestore();
    }
  });
});

// -- site-data dev freshness -------------------------------------------------

describe('absolutePress site-data dev freshness', () => {
  const RESOLVED_ID = '\0virtual:absolute-press/site-data';

  it('refreshes the hook, invalidates the module and reloads on md edits', async () => {
    let calls = 0;
    const onScan = (): { n: number } => ({ n: ++calls });
    const { plugin, root } = await devFixture(
      { 'a.md': '---\ntag: x\n---\n# A\n' },
      userConfig({ onScan }),
    );
    const server = stubServer(plugin);
    // Flush the initial sync first (the middleware's ready gate).
    await waitHandled(callMiddleware(server, '/a'));
    expect(calls).toBe(1);
    server.modules.set(RESOLVED_ID, { id: RESOLVED_ID });

    await writeFile(
      path.join(root, 'content', 'a.md'),
      '---\ntag: y\n---\n# A\n',
    );
    server.fire('change', path.join(root, 'content', 'a.md'));
    await vi.waitFor(() => expect(server.invalidated).toEqual([RESOLVED_ID]), {
      timeout: 30_000,
      interval: 50,
    });
    expect(server.sent.at(-1)).toMatchObject({ type: 'full-reload' });
    // The hook reran for the edit and the module serves the fresh result.
    expect(calls).toBe(2);
    await expect(callHook(plugin.load, {}, RESOLVED_ID)).resolves.toBe(
      'export default {"n":2};\n',
    );
  });

  it('invalidates the module after a structural resync', async () => {
    const { plugin, root } = await devFixture(
      { 'index.md': '# Home\n' },
      userConfig({ onScan: (): number => 1 }),
    );
    const server = stubServer(plugin);
    await waitHandled(callMiddleware(server, '/'));
    server.modules.set(RESOLVED_ID, { id: RESOLVED_ID });
    server.fire('add', path.join(root, 'content', 'new.md'));
    await vi.waitFor(() => expect(server.invalidated).toEqual([RESOLVED_ID]), {
      timeout: 30_000,
      interval: 50,
    });
    expect(server.sent.at(-1)).toMatchObject({ type: 'full-reload' });
  });

  it('reports md-edit hook failures over ws instead of swallowing them', async () => {
    let calls = 0;
    const onScan = (): number => {
      if (++calls > 1) throw new Error('hook exploded');
      return calls;
    };
    const { plugin, root } = await devFixture(
      { 'index.md': '# Home\n' },
      userConfig({ onScan }),
    );
    const server = stubServer(plugin);
    await waitHandled(callMiddleware(server, '/'));
    server.fire('change', path.join(root, 'content', 'index.md'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await vi.waitFor(() => expect(server.sent).toHaveLength(1), {
        timeout: 30_000,
        interval: 50,
      });
      // Assert inside try: mockRestore() wipes the recorded calls.
      expect(errSpy).toHaveBeenCalledWith(
        '[absolute-press] dev site-data refresh failed',
        expect.anything(),
      );
    } finally {
      errSpy.mockRestore();
    }
    expect(server.sent[0]).toMatchObject({ type: 'error' });
    expect(server.sent[0]?.err?.message).toBe('hook exploded');
    expect(server.sent[0]?.err?.stack).toBeTruthy();
  });
});

describe('debounceTrailing', () => {
  it('collapses a burst into one trailing call and re-arms afterwards', () => {
    vi.useFakeTimers();
    try {
      const calls: number[] = [];
      const debounced = debounceTrailing(100, () => calls.push(Date.now()));
      debounced.push();
      vi.advanceTimersByTime(99);
      debounced.push();
      vi.advanceTimersByTime(99);
      // Each push restarts the window: nothing ran yet.
      expect(calls).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(calls).toHaveLength(1);
      // The debouncer re-arms for the next burst.
      debounced.push();
      vi.advanceTimersByTime(100);
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel drops the pending call without invoking fn', () => {
    vi.useFakeTimers();
    try {
      let ran = false;
      const debounced = debounceTrailing(100, () => {
        ran = true;
      });
      debounced.push();
      debounced.cancel();
      vi.advanceTimersByTime(1000);
      expect(ran).toBe(false);
      // cancel is idempotent and push works again afterwards.
      expect(() => debounced.cancel()).not.toThrow();
      debounced.push();
      vi.advanceTimersByTime(100);
      expect(ran).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

/** Minimal ServerResponse stub recording status/redirect. */
interface PreviewRes {
  statusCode: number;
  location: string | undefined;
  ended: boolean;
}

function fakeRes(): PreviewRes {
  const res = {
    statusCode: 0,
    location: undefined as string | undefined,
    ended: false,
    setHeader(name: string, value: string): void {
      if (name.toLowerCase() === 'location') res.location = value;
    },
    end(): void {
      res.ended = true;
    },
  };
  return res;
}

/** Wire the preview middleware of a fresh plugin for one dist fixture. */
function previewMiddleware(
  cfg: AbsolutePressConfig,
  root: string,
): (req: { url?: string }, res: PreviewRes, next: () => void) => void {
  const plugin = livePlugin(cfg);
  // The middleware reads the resolved site config (directoryIndex mode).
  callHook(plugin.configResolved, {}, { root });
  let middleware:
    | ((req: { url?: string }, res: PreviewRes, next: () => void) => void)
    | undefined;
  callHook(
    plugin.configurePreviewServer,
    {},
    {
      config: { root, build: { outDir: 'dist' } },
      middlewares: {
        use: (fn: NonNullable<typeof middleware>) => {
          middleware = fn;
        },
      },
    },
  );
  if (!middleware) throw new Error('preview middleware not registered');
  return middleware;
}

/** dist fixture: one directory index, one leaf page, one CJK directory. */
async function distFixture(): Promise<string> {
  const root = await makeTmp('ap-preview-');
  const cjkDir = '标签';
  await mkdir(path.join(root, 'dist/guide'), { recursive: true });
  await mkdir(path.join(root, 'dist', cjkDir), { recursive: true });
  await writeFile(path.join(root, 'dist/guide/index.html'), '<html></html>');
  await writeFile(path.join(root, 'dist/guide/a.html'), '<html></html>');
  await writeFile(
    path.join(root, 'dist', cjkDir, 'index.html'),
    '<html></html>',
  );
  return root;
}

describe('absolutePress preview server', () => {
  it('rewrites directory and leaf urls, 301s bare directory routes (slash mode)', async () => {
    const root = await distFixture();
    const middleware = previewMiddleware(userConfig(), root);

    const run = (url: string): string | undefined => {
      const req: { url?: string } = { url };
      middleware(req, fakeRes(), () => {});
      return req.url;
    };
    // Existing-file branch: directory urls resolve their index.html.
    expect(run('/')).toBe('/index.html');
    expect(run('/guide/')).toBe('/guide/index.html');
    expect(run('/guide/?x=1')).toBe('/guide/index.html?x=1');
    // Extensionless leaf pages resolve their .html file (GH Pages semantics).
    expect(run('/guide/a')).toBe('/guide/a.html');
    expect(run('/guide/a?x=1')).toBe('/guide/a.html?x=1');
    // Exact files and legacy .html bookmarks pass through untouched.
    expect(run('/guide/a.html')).toBe('/guide/a.html');
    expect(run('/rss.xml')).toBe('/rss.xml');

    // Directory route without the trailing slash: 301 like GH Pages.
    const redirect = (url: string): PreviewRes => {
      const res = fakeRes();
      middleware({ url }, res, () => {});
      return res;
    };
    // toMatchObject: the stub's own methods are not part of the assertion.
    expect(redirect('/guide')).toMatchObject({
      statusCode: 301,
      location: '/guide/',
      ended: true,
    });
    expect(redirect('/guide?x=1')).toMatchObject({
      statusCode: 301,
      location: '/guide/?x=1',
      ended: true,
    });
    // On-disk names are the decoded route segments (routeToFileName), so
    // the existence check decodes percent-encoded CJK segments.
    expect(redirect('/%E6%A0%87%E7%AD%BE')?.location).toBe(
      '/%E6%A0%87%E7%AD%BE/',
    );

    // No dist folder, malformed encoding or path traversal: pass through to
    // the static server (404 or plain serve).
    const passThrough = (url: string): { url?: string; nexted: boolean } => {
      let nexted = false;
      const req: { url?: string } = { url };
      middleware(req, fakeRes(), () => {
        nexted = true;
      });
      return { url: req.url, nexted };
    };
    expect(passThrough('/missing')).toEqual({ url: '/missing', nexted: true });
    expect(passThrough('/%zz')).toEqual({ url: '/%zz', nexted: true });
    expect(passThrough('/..%2Fsecret')).toEqual({
      url: '/..%2Fsecret',
      nexted: true,
    });
  });

  it('resolves pages whose file stem contains a dot', async () => {
    const root = await distFixture();
    await mkdir(path.join(root, 'dist/notes'), { recursive: true });
    await writeFile(path.join(root, 'dist/notes/vue.js.html'), '<html></html>');
    const middleware = previewMiddleware(userConfig(), root);

    const run = (url: string): string | undefined => {
      const req: { url?: string } = { url };
      middleware(req, fakeRes(), () => {});
      return req.url;
    };
    // extname sees '.js' and would pass the page through to a static 404;
    // the dist probe resolves its .html file instead.
    expect(run('/notes/vue.js')).toBe('/notes/vue.js.html');
    // Real extensionful assets keep passing through untouched.
    expect(run('/assets/app.css')).toBe('/assets/app.css');
  });

  it('serves directory indexes bare and 301s trailing-slash urls (bare mode)', async () => {
    const root = await distFixture();
    const middleware = previewMiddleware(
      userConfig({ urls: { directoryIndex: 'bare' } }),
      root,
    );

    const run = (url: string): string | undefined => {
      const req: { url?: string } = { url };
      middleware(req, fakeRes(), () => {});
      return req.url;
    };
    // The root keeps its trailing slash in both modes.
    expect(run('/')).toBe('/index.html');
    // Bare directory url serves the index in place (CF Pages semantics).
    expect(run('/guide')).toBe('/guide/index.html');
    // Leaf pages still resolve their .html file.
    expect(run('/guide/a')).toBe('/guide/a.html');

    // Trailing-slash directory urls redirect to the bare canonical.
    const redirect = (url: string): PreviewRes => {
      const res = fakeRes();
      middleware({ url }, res, () => {});
      return res;
    };
    expect(redirect('/guide/')).toMatchObject({
      statusCode: 301,
      location: '/guide',
      ended: true,
    });
    expect(redirect('/guide/?x=1')).toMatchObject({
      statusCode: 301,
      location: '/guide?x=1',
      ended: true,
    });
  });
});

// -- build emit --------------------------------------------------------------

function entryChunk(): TestBundleEntry {
  return { type: 'chunk', fileName: 'assets/entry-x.js', isEntry: true };
}

function cssAsset(name: string): TestBundleEntry {
  return { type: 'asset', fileName: name };
}

describe('absolutePress generateBundle', () => {
  it('emits pages plus feeds and links only the entry css graph', async () => {
    const root = await makeTmp('ap-build-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(
      path.join(root, 'content', 'index.md'),
      '# Home\n\nhello\n',
    );
    const plugin = await buildSidePlugin(root);
    const ctx = stubBuildCtx();
    callHook(
      plugin.generateBundle,
      ctx,
      {},
      bundleOf([
        // rolldown-vite attaches the css graph under a minified key.
        {
          ...entryChunk(),
          X7: {
            importedCss: new Set(['assets/app.css', 'assets/phantom.css']),
          },
        },
        cssAsset('assets/app.css'),
        cssAsset('assets/doc.css'),
      ]),
      true,
    );

    const names = ctx.emitted.map(f => f.fileName);
    expect(names).toContain('index.html');
    expect(names).toContain('rss.xml');
    expect(names).toContain('sitemap.xml');
    expect(names).toContain('robots.txt');
    // No math in the fixture: neither the katex link nor its assets ship.
    expect(names).not.toContain('assets/katex/katex.min.css');

    const html = emittedHtml(ctx.emitted, 'index.html');
    // Metadata-driven set: app.css only, phantom css filtered out.
    expect(html).toContain('<link rel="stylesheet" href="assets/app.css">');
    expect(html).not.toContain('assets/phantom.css');
    expect(html).not.toContain('assets/doc.css');
    expect(html).not.toContain('assets/katex/katex.min.css');
    expect(html).toContain('<script type="module" src="assets/entry-x.js">');
  });

  it('emits katex assets and links them on math pages only', async () => {
    const root = await makeTmp('ap-katex-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(
      path.join(root, 'content', 'index.md'),
      '# Home\n\nhello\n',
    );
    await writeFile(
      path.join(root, 'content', 'math.md'),
      '# Math\n\n$E=mc^2$\n',
    );
    const plugin = await buildSidePlugin(root);
    const ctx = stubBuildCtx();
    callHook(
      plugin.generateBundle,
      ctx,
      {},
      bundleOf([entryChunk(), cssAsset('assets/app.css')]),
      true,
    );

    const names = ctx.emitted.map(f => f.fileName);
    expect(names).toContain('assets/katex/katex.min.css');
    // Only the woff2 fonts ship; the legacy woff/ttf fallbacks stay out.
    for (const name of names.filter(n => n.startsWith('assets/katex/fonts/'))) {
      expect(name.endsWith('.woff2')).toBe(true);
    }
    const mathHtml = emittedHtml(ctx.emitted, 'math.html');
    expect(mathHtml).toContain(
      '<link rel="stylesheet" href="assets/katex/katex.min.css">',
    );
    const homeHtml = emittedHtml(ctx.emitted, 'index.html');
    expect(homeHtml).not.toContain('assets/katex/katex.min.css');
  });

  it('falls back to every css asset when the chunk lacks graph metadata', async () => {
    const root = await makeTmp('ap-build-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(path.join(root, 'content', 'index.md'), '# Home\n');
    const plugin = await buildSidePlugin(root);
    const ctx = stubBuildCtx();
    callHook(
      plugin.generateBundle,
      ctx,
      {},
      bundleOf([
        entryChunk(),
        cssAsset('assets/app.css'),
        cssAsset('assets/doc.css'),
      ]),
      true,
    );
    const html = emittedHtml(ctx.emitted, 'index.html');
    expect(html).toContain('<link rel="stylesheet" href="assets/app.css">');
    expect(html).toContain('<link rel="stylesheet" href="assets/doc.css">');
  });

  it('fails the build when no entry chunk is present', async () => {
    const root = await makeTmp('ap-build-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(path.join(root, 'content', 'index.md'), '# Home\n');
    const plugin = await buildSidePlugin(root);
    const ctx = stubBuildCtx();
    expect(() =>
      callHook(
        plugin.generateBundle,
        ctx,
        {},
        bundleOf([cssAsset('assets/x.css')]),
        true,
      ),
    ).toThrowError(/client entry chunk not found/);
  });

  it('fails the build on dead links, listing file, line and raw href', async () => {
    const root = await makeTmp('ap-build-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(
      path.join(root, 'content', 'index.md'),
      '# Home\n\n[missing](./missing.md)\n',
    );
    const plugin = await buildSidePlugin(root);
    const ctx = stubBuildCtx();
    expect(() =>
      callHook(
        plugin.generateBundle,
        ctx,
        {},
        bundleOf([entryChunk(), cssAsset('assets/app.css')]),
        true,
      ),
    ).toThrowError(/1 dead link\(s\)[\s\S]*index\.md:3 -> \.\/missing\.md/);
  });

  it('fails the build on bare links under the strict error policy', async () => {
    const root = await makeTmp('ap-build-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(path.join(root, 'content', 'index.md'), '[a](guide.md)\n');
    await writeFile(path.join(root, 'content', 'guide.md'), '# Guide\n');
    const plugin = await buildSidePlugin(
      root,
      userConfig({ strictLinks: 'error' }),
    );
    const ctx = stubBuildCtx();
    expect(() =>
      callHook(
        plugin.generateBundle,
        ctx,
        {},
        bundleOf([entryChunk(), cssAsset('assets/app.css')]),
        true,
      ),
    ).toThrowError(/1 bare relative link\(s\)[\s\S]*strictLinks: 'error'/);
  });

  it('rejects frontmatter icons missing from the config icons map', async () => {
    const root = await makeTmp('ap-build-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(
      path.join(root, 'content', 'index.md'),
      '---\nicon: ghost\n---\n\n# Home\n',
    );
    const plugin = await buildSidePlugin(root);
    const ctx = stubBuildCtx();
    expect(() =>
      callHook(
        plugin.generateBundle,
        ctx,
        {},
        bundleOf([entryChunk(), cssAsset('assets/app.css')]),
        true,
      ),
    ).toThrowError(/icon\(s\) not registered[\s\S]*icon "ghost"/);
  });

  it('emits no page html when buildStart never synced (serve-mode gate)', async () => {
    const root = await makeTmp('ap-build-');
    await mkdir(path.join(root, 'content'), { recursive: true });
    await writeFile(path.join(root, 'content', 'index.md'), '# Home\n');
    const plugin = livePlugin(userConfig());
    runConfig(plugin, { root }, hookEnv('serve'));
    callHook(plugin.configResolved, {}, { root });
    // rolldown-vite also runs buildStart for the dev server; only the actual
    // build may flip the store into sync/scan state.
    await callHook(plugin.buildStart, {});
    const ctx = stubBuildCtx();
    callHook(
      plugin.generateBundle,
      ctx,
      {},
      bundleOf([entryChunk(), cssAsset('assets/app.css')]),
      true,
    );
    // store.sync never ran -> the scanned page set is empty -> feeds and
    // static assets are emitted, but no page html.
    const names = ctx.emitted.map(f => f.fileName);
    expect(names).toContain('rss.xml');
    expect(names).not.toContain('index.html');
  });
});
