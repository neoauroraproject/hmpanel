import {
  getAllFeatureIds,
  getAllModuleIds,
  getModulesForFeature,
} from './manifests';
import type { LicenseState } from './types/module-manifest.types';

/**
 * Entitlements are module ids (`store`, `payment-management`).
 *
 * The license server still names the JWT claim `features` for wire compatibility, and
 * tokens minted before modular licensing carried coarse feature ids (`WHITE_LABEL`).
 * Everything is normalised to module ids here so the rest of the panel gates on one
 * vocabulary; `LicenseState.licensedFeatures` therefore also holds module ids going
 * forward and is kept in sync with `LicenseState.licensedModules`.
 *
 * An empty list licenses nothing. Full access is only granted when the payload says so
 * explicitly — see {@link resolveEntitlement}.
 */
export interface EntitlementSource {
  /** JWT `features` claim or `response.features`. `undefined` means "claim absent". */
  features?: unknown;
  /** `response.entitlements` — object (`{ modules, legacyFull }`) or plain array. */
  entitlements?: unknown;
  plan?: unknown;
  entitlementMode?: unknown;
  legacyFull?: unknown;
}

export interface ResolvedEntitlement {
  licensedModules: string[];
  legacyFull: boolean;
  plan: string | null;
  /**
   * `false` when the payload carried no entitlement information at all, so callers that
   * merge into an existing state (heartbeat) can keep what they already had.
   */
  present: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function asPlan(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function isFullMode(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'full';
}

/** Maps module ids, legacy feature ids and unknown ids onto the licensed module set. */
export function normalizeToModuleIds(values: string[]): string[] {
  const knownModules = new Set(getAllModuleIds());
  const out = new Set<string>();

  for (const raw of values) {
    const value = String(raw).trim();
    if (!value) continue;

    if (knownModules.has(value)) {
      out.add(value);
      continue;
    }

    const owners = getModulesForFeature(value);
    if (owners.length) {
      for (const owner of owners) out.add(owner);
      continue;
    }

    // Unknown id — keep it so a newer license server can license modules this build
    // does not ship a manifest for yet.
    out.add(value);
  }

  return [...out];
}

/**
 * Turns a license-server payload into the licensed module set.
 *
 * Full access is granted only when the payload explicitly says so:
 *  - `legacyFull === true` or `entitlementMode === 'full'`, or
 *  - the list already covers the whole catalog (or every legacy feature id), or
 *  - the payload carries neither a module list nor a plan, which is the shape of a
 *    pre-modular license (null plan + null modules on the server).
 *
 * An empty list is never expanded — it means "nothing licensed".
 */
export function resolveEntitlement(source: EntitlementSource): ResolvedEntitlement {
  const entitlements = asRecord(source.entitlements);
  const plan = asPlan(
    source.plan,
    entitlements?.plan,
    entitlements?.planName,
    entitlements?.planSlug,
  );

  if (
    source.legacyFull === true ||
    entitlements?.legacyFull === true ||
    isFullMode(source.entitlementMode) ||
    isFullMode(entitlements?.entitlementMode)
  ) {
    return { licensedModules: getAllModuleIds(), legacyFull: true, plan, present: true };
  }

  const rawList =
    asStringList(source.features) ??
    asStringList(entitlements?.modules) ??
    asStringList(entitlements?.features) ??
    asStringList(source.entitlements);

  if (rawList) {
    const licensedModules = normalizeToModuleIds(rawList);
    const catalog = getAllModuleIds();
    const allFeatures = getAllFeatureIds();
    const legacyFull =
      (catalog.length > 0 && catalog.every((id) => licensedModules.includes(id))) ||
      // A token enumerating every legacy feature id is the old "everything" grant —
      // it predates module ids, so it cannot name the modules that ship no features.
      (allFeatures.length > 0 && allFeatures.every((f) => rawList.includes(f)));

    return {
      licensedModules: legacyFull
        ? [...new Set([...licensedModules, ...catalog])]
        : licensedModules,
      legacyFull,
      plan,
      present: true,
    };
  }

  if (plan === null) {
    return { licensedModules: getAllModuleIds(), legacyFull: true, plan: null, present: false };
  }

  // The server named a plan but listed no modules — that plan licenses nothing here.
  return { licensedModules: [], legacyFull: false, plan, present: true };
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = Buffer.from(
      parts[1].replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Builds an {@link EntitlementSource} from an activate/heartbeat response + its JWT. */
export function entitlementSourceFromResponse(
  data: Record<string, unknown>,
  entitlementJwt?: string | null,
): EntitlementSource {
  const token =
    entitlementJwt ?? (typeof data.entitlementJwt === 'string' ? data.entitlementJwt : null);
  const claims = token ? decodeJwtPayload(token) : null;
  const license = asRecord(data.license);

  return {
    features: data.features ?? claims?.features,
    entitlements: data.entitlements ?? claims?.entitlements,
    plan: data.plan ?? license?.plan ?? license?.planName ?? claims?.plan,
    entitlementMode: data.entitlementMode ?? claims?.entitlementMode,
    legacyFull: data.legacyFull ?? claims?.legacyFull,
  };
}

/**
 * Back-fills `licensedModules` on states persisted before modular licensing.
 *
 * A stored list that covered every known feature id was the old "everything" sentinel,
 * so it maps to legacy Full. An empty stored list still licenses nothing.
 */
export function hydrateLicensedModules(state: LicenseState): LicenseState {
  if (Array.isArray(state.licensedModules)) return state;

  const stored = Array.isArray(state.licensedFeatures) ? state.licensedFeatures : [];
  if (stored.length === 0) {
    return { ...state, licensedModules: [], legacyFull: state.legacyFull === true };
  }

  const allFeatures = getAllFeatureIds();
  if (allFeatures.length > 0 && allFeatures.every((f) => stored.includes(f))) {
    const licensedModules = getAllModuleIds();
    return { ...state, licensedModules, licensedFeatures: licensedModules, legacyFull: true };
  }

  const licensedModules = normalizeToModuleIds(stored);
  return {
    ...state,
    licensedModules,
    licensedFeatures: licensedModules,
    legacyFull: state.legacyFull === true,
  };
}

/** Licensed module ids for a state, tolerating states that only carry the legacy array. */
export function licensedModuleSet(state: Pick<LicenseState, 'licensedModules' | 'licensedFeatures'>): Set<string> {
  const ids = state.licensedModules ?? state.licensedFeatures ?? [];
  return new Set(ids);
}
