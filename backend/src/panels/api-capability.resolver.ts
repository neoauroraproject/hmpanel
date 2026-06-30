import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface PanelCapabilities {
  bulkEnable?: boolean;
  bulkDisable?: boolean;
  bulkExport?: boolean;
  bulkCreate?: boolean;
  bulkDelete?: boolean;
  bulkResetTraffic?: boolean;
  clientsApi?: boolean;
  pagination?: boolean;
  slimInbounds?: boolean;
  observatory?: boolean;
  websocket?: boolean;
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

    const docsDir = path.join(process.cwd(), '../docs');
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
        const fallbackCaps = this.getDefaultCapabilities(
          major >= 3 && minor >= 4,
        );
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
        const fallbackCaps = this.getDefaultCapabilities(
          major >= 3 && minor >= 4,
        );
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
        bulkDelete: paths.includes('/panel/api/clients/bulkDel'),
        bulkResetTraffic: paths.includes('/panel/api/clients/bulkResetTraffic'),
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
      const fallbackCaps = this.getDefaultCapabilities(
        major >= 3 && minor >= 4,
      );
      return { capabilities: fallbackCaps, hash: 'fallback-error' };
    }
  }

  private getDefaultCapabilities(isNewApi: boolean): PanelCapabilities {
    return {
      clientsApi: true,
      pagination: isNewApi,
      slimInbounds: isNewApi,
      observatory: isNewApi,
      websocket: false,
      bulkEnable: isNewApi,
      bulkDisable: isNewApi,
      bulkExport: isNewApi,
      bulkCreate: isNewApi,
      bulkDelete: isNewApi,
      bulkResetTraffic: isNewApi,
    };
  }
}
