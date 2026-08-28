import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { isPanelApiAtLeast } from '../common/utils/panel-version.util';
import { resolveOpenApiDocsDir } from '../common/utils/resolve-openapi-docs-dir';

export interface PanelCapabilities {
  bulkEnable?: boolean;
  bulkDisable?: boolean;
  bulkExport?: boolean;
  bulkCreate?: boolean;
  bulkAdjust?: boolean;
  bulkDelete?: boolean;
  bulkResetTraffic?: boolean;
  clientsApi?: boolean;
  pagination?: boolean;
  slimInbounds?: boolean;
  observatory?: boolean;
  websocket?: boolean;
  /** Client schema exposes WireGuard peer fields (3.4.2+) */
  wireguardClientFields?: boolean;
  /** InboundOption exposes wgDns/wgMtu/wgPublicKey (3.4.2+) */
  wireguardInboundFields?: boolean;
  /** Hosts API uses groupId paths (3.5.0+) */
  hostsGroupedApi?: boolean;
  /** Panel self-update status endpoint (3.5.0+) */
  panelUpdateStatus?: boolean;
  /** HWID limit API (3.7.0+) */
  hwidsApi?: boolean;
  /** Subscription balancers API (3.7.0+) */
  subBalancersApi?: boolean;
  /** Xray geodata management API (3.7.0+) */
  xrayGeodataApi?: boolean;
  [key: string]: boolean | undefined;
}

export interface ResolvedCapabilities {
  capabilities: PanelCapabilities;
  hash: string;
}

@Injectable()
export class ApiCapabilityResolver {
  private readonly logger = new Logger(ApiCapabilityResolver.name);

  // Cache parsed capability maps by: fileHash -> ResolvedCapabilities
  private cache = new Map<string, ResolvedCapabilities>();

  /**
   * Resolves the panel capabilities by parsing the local OpenAPI specifications
   * matching the panel version, bypassing the need for HTTP wrong-method probing.
   */
  resolve(apiVersion: string, schemaVersion: string): ResolvedCapabilities {
    this.logger.log(
      `[CAP_RESOLVER] Resolving capabilities for API ${apiVersion} (schema ${schemaVersion})...`,
    );

    // Clean apiVersion (e.g. "3.4.2" -> [3, 4, 2])
    const vMatch = apiVersion.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    let major = 3,
      minor = 4,
      patch = 2;
    if (vMatch) {
      major = parseInt(vMatch[1] || '3', 10);
      minor = parseInt(vMatch[2] || '0', 10);
      patch = parseInt(vMatch[3] || '0', 10);
    }

    const docsDir = resolveOpenApiDocsDir() ?? path.join(process.cwd(), '../docs');
    let specFile = '';
    let compatibilityMode = false;

    try {
      // Find all available spec files: apiXXX.json
      const files = fs.existsSync(docsDir) ? fs.readdirSync(docsDir) : [];
      const specs = files
        .filter((f) => /^api\d+\.json$/.test(f))
        .map((f) => {
          const numStr = f.replace('api', '').replace('.json', '');
          const maj = parseInt(numStr.charAt(0) || '0', 10);
          const min = parseInt(numStr.charAt(1) || '0', 10);
          const pat = parseInt(numStr.substring(2) || '0', 10);
          return { file: f, maj, min, pat, val: maj * 10000 + min * 100 + pat };
        })
        .sort((a, b) => b.val - a.val); // Sort descending (highest first)

      if (specs.length > 0) {
        // 1. Try exact Minor version match (or higher patch)
        const exactMinor = specs.find(
          (s) => s.maj === major && s.min === minor,
        );

        if (exactMinor) {
          specFile = exactMinor.file;
        } else {
          // 2. Compatibility Mode: Use highest available spec overall
          specFile = specs[0].file;
          compatibilityMode = true;
        }
      }

      if (!specFile) {
        this.logger.warn(`[CAP_RESOLVER] No spec files found in ${docsDir}.`);
        const fallbackCaps = this.getDefaultCapabilities(apiVersion);
        return { capabilities: fallbackCaps, hash: 'fallback-no-specs' };
      }

      if (compatibilityMode) {
        this.logger.warn(
          `[CAP_RESOLVER] Compatibility Mode | Panel Version: ${apiVersion} | Spec Version: ${specFile} | Schema Version: ${schemaVersion}`,
        );
      }

      const specPath = path.join(docsDir, specFile);
      if (!fs.existsSync(specPath)) {
        this.logger.warn(
          `OpenAPI spec not found at ${specPath}, falling back to default capabilities`,
        );
        const fallbackCaps = this.getDefaultCapabilities(apiVersion);
        return {
          capabilities: fallbackCaps,
          hash: `fallback-missing-${specFile}`,
        };
      }

      const raw = fs.readFileSync(specPath, 'utf8');
      const fileHash = require('crypto')
        .createHash('sha256')
        .update(raw)
        .digest('hex');

      if (this.cache.has(fileHash)) {
        this.logger.log(
          `[CAP_RESOLVER] Returning cached capabilities for hash: ${fileHash}`,
        );
        return this.cache.get(fileHash)!;
      }

      const spec = JSON.parse(raw);
      const paths = spec.paths ? Object.keys(spec.paths) : [];
      const schemas = spec.components?.schemas || {};
      const clientProps = Object.keys(schemas.Client?.properties || {});
      const inboundOptionProps = Object.keys(
        schemas.InboundOption?.properties || {},
      );

      const capabilities: PanelCapabilities = {
        clientsApi: paths.includes('/panel/api/clients/list'),
        pagination: paths.includes('/panel/api/clients/list/paged'),
        slimInbounds:
          paths.includes('/panel/api/inbounds/options') ||
          paths.includes('/panel/api/inbounds/list/slim'),
        observatory: paths.includes('/panel/api/server/xrayObservatory'),
        websocket: paths.includes('/panel/api/server/websocket'),
        bulkEnable: paths.includes('/panel/api/clients/bulkEnable'),
        bulkDisable: paths.includes('/panel/api/clients/bulkDisable'),
        bulkExport: paths.includes('/panel/api/clients/export'),
        bulkCreate: paths.includes('/panel/api/clients/bulkCreate'),
        bulkAdjust: paths.includes('/panel/api/clients/bulkAdjust'),
        bulkDelete: paths.includes('/panel/api/clients/bulkDel'),
        bulkResetTraffic: paths.includes('/panel/api/clients/bulkResetTraffic'),
        // WireGuard + protocol extras (derive from schema, not hardcoded version)
        wireguardClientFields:
          clientProps.includes('privateKey') &&
          clientProps.includes('publicKey') &&
          clientProps.includes('allowedIPs'),
        wireguardInboundFields:
          inboundOptionProps.includes('wgDns') ||
          inboundOptionProps.includes('wgPublicKey') ||
          inboundOptionProps.includes('wgMtu'),
        hostsGroupedApi: paths.some(
          (p) =>
            p.includes('/panel/api/hosts/') &&
            (p.includes('{groupId}') || p.includes('/bulk/add')),
        ),
        panelUpdateStatus: paths.includes(
          '/panel/api/server/getUpdateStatus',
        ),
        hwidsApi: paths.some((p) => p.includes('/panel/api/clients/hwids/')),
        subBalancersApi: paths.includes('/panel/api/sub-balancers'),
        xrayGeodataApi: paths.some((p) => p.includes('/panel/api/xray/geodata/')),
      };

      this.logger.log(
        `[CAP_RESOLVER] Resolved: ${Object.entries(capabilities)
          .filter((c) => c[1])
          .map((c) => c[0])
          .join(', ')}`,
      );

      const result = { capabilities, hash: fileHash };
      this.cache.set(fileHash, result);
      return result;
    } catch (err: any) {
      this.logger.error(`Failed to resolve capabilities: ${err.message}`);
      const fallbackCaps = this.getDefaultCapabilities(apiVersion);
      return { capabilities: fallbackCaps, hash: 'fallback-error' };
    }
  }

  private getDefaultCapabilities(apiVersion: string): PanelCapabilities {
    const is342Plus = isPanelApiAtLeast(apiVersion, 3, 4, 2);
    const is350Plus = isPanelApiAtLeast(apiVersion, 3, 5, 0);
    return {
      clientsApi: true,
      pagination: is342Plus,
      slimInbounds: is342Plus,
      observatory: is342Plus,
      websocket: false,
      bulkEnable: is342Plus,
      bulkDisable: is342Plus,
      bulkExport: is342Plus,
      bulkCreate: is342Plus,
      bulkAdjust: is342Plus,
      bulkDelete: is342Plus,
      bulkResetTraffic: is342Plus,
      wireguardClientFields: is342Plus,
      wireguardInboundFields: is342Plus,
      hostsGroupedApi: is350Plus,
      panelUpdateStatus: is350Plus,
    };
  }
}
