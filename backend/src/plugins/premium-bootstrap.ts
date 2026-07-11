/**
 * Load premium Nest modules BEFORE NestFactory.create so HTTP controllers
 * are registered during normal bootstrap. LazyModuleLoader cannot register
 * controllers/routes — that was the root cause of all premium API 404s.
 *
 * Bundle updates still work: download new files → process.exit → Docker
 * start.sh restarts backend → this loader picks up the new index.js.
 */
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import type { Type } from '@nestjs/common';

export interface PremiumBootstrapResult {
  modules: Type<unknown>[];
  loaded: boolean;
  segments: string[];
  pluginPath: string | null;
  hmpanelDist: string;
  error: string | null;
}

let bootstrapResult: PremiumBootstrapResult | null = null;

export function getPremiumBootstrapResult(): PremiumBootstrapResult {
  return (
    bootstrapResult ?? {
      modules: [],
      loaded: false,
      segments: [],
      pluginPath: null,
      hmpanelDist: resolveHmpanelDist(),
      error: null,
    }
  );
}

export function resolveHmpanelDist(): string {
  const candidates = [
    process.env.HMPANEL_DIST,
    path.join(process.cwd(), 'backend', 'dist'),
    '/app/backend/dist',
    path.join(process.cwd(), 'dist'),
  ].filter((v): v is string => Boolean(v?.trim()));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'main.js'))) {
      return dir;
    }
  }

  return path.join(process.cwd(), 'backend', 'dist');
}

function ensurePremiumModulePaths(distPath: string): void {
  const extra = [
    process.env.PREMIUM_NODE_PATH,
    path.join(path.dirname(distPath), 'node_modules'),
    path.join(process.cwd(), 'node_modules'),
    path.join(process.cwd(), 'backend', 'node_modules'),
    '/app/backend/node_modules',
    '/app/node_modules',
  ]
    .filter((v): v is string => Boolean(v?.trim()))
    .filter((p) => fs.existsSync(p));

  const current = (process.env.NODE_PATH || '')
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean);

  const merged = [...new Set([...extra, ...current])];
  process.env.NODE_PATH = merged.join(path.delimiter);

  // NODE_PATH is only read at process start unless we re-init module paths.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require('module') as { _initPaths?: () => void };
    Module._initPaths?.();
  } catch {
    /* best-effort */
  }
}

function resolvePluginPath(): string {
  return (
    process.env.PREMIUM_PLUGIN_PATH ||
    path.join('/opt/hmpanel/premium', 'backend', 'index.js')
  );
}

/**
 * Require the premium bundle and collect Nest module classes for AppModule.imports.
 * Safe to call when no bundle is installed (returns empty modules).
 */
export function loadPremiumModulesForBootstrap(): PremiumBootstrapResult {
  const pluginPath = resolvePluginPath();
  const hmpanelDist = resolveHmpanelDist();
  process.env.HMPANEL_DIST = hmpanelDist;
  ensurePremiumModulePaths(hmpanelDist);

  if (!fs.existsSync(pluginPath)) {
    bootstrapResult = {
      modules: [],
      loaded: false,
      segments: [],
      pluginPath: null,
      hmpanelDist,
      error: null,
    };
    console.log('[PremiumBootstrap] No premium bundle on disk — Community mode.');
    return bootstrapResult;
  }

  try {
    const anchor = path.join(hmpanelDist, 'main.js');
    const req = createRequire(fs.existsSync(anchor) ? anchor : __filename);

    try {
      const resolved = req.resolve(pluginPath);
      delete req.cache[resolved];
    } catch {
      /* first load */
    }

    const bundle = req(pluginPath) as Record<string, unknown>;
    const modules: Type<unknown>[] = [];
    const segments: string[] = [];

    const candidates: Array<{ name: string; key: string }> = [
      { name: 'core', key: 'PremiumCoreBundleModule' },
      { name: 'backup', key: 'PremiumBackupBundleModule' },
      { name: 'monitoring', key: 'PremiumMonitoringBundleModule' },
    ];

    for (const { name, key } of candidates) {
      const mod = bundle[key];
      if (mod) {
        modules.push(mod as Type<unknown>);
        segments.push(name);
      }
    }

    if (modules.length === 0) {
      const mono = bundle.PremiumBundleModule || bundle.default;
      if (mono) {
        modules.push(mono as Type<unknown>);
        segments.push('monolith');
      }
    }

    if (modules.length === 0) {
      throw new Error(
        'Premium bundle does not export PremiumCoreBundleModule / PremiumBundleModule.',
      );
    }

    bootstrapResult = {
      modules,
      loaded: true,
      segments,
      pluginPath,
      hmpanelDist,
      error: null,
    };
    console.log(
      `[PremiumBootstrap] Loaded segments [${segments.join(', ')}] from ${pluginPath}`,
    );
    return bootstrapResult;
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error(`[PremiumBootstrap] Failed to load premium bundle: ${message}`);
    if (err?.stack) console.error(err.stack);
    bootstrapResult = {
      modules: [],
      loaded: false,
      segments: [],
      pluginPath,
      hmpanelDist,
      error: message,
    };
    return bootstrapResult;
  }
}

export function markPremiumBootstrapFailed(error: string): void {
  const prev = bootstrapResult;
  bootstrapResult = {
    modules: [],
    loaded: false,
    segments: [],
    pluginPath: prev?.pluginPath ?? null,
    hmpanelDist: prev?.hmpanelDist ?? resolveHmpanelDist(),
    error,
  };
}
