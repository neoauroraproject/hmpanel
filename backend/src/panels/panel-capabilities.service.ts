import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApiCapabilityResolver,
  PanelCapabilities,
  ResolvedCapabilities,
} from './api-capability.resolver';

export interface ScanResult {
  capabilities: PanelCapabilities;
  apiVersion: string;
}

@Injectable()
export class PanelCapabilitiesService {
  private readonly logger = new Logger(PanelCapabilitiesService.name);

  constructor(
    private prisma: PrismaService,
    private apiCapabilityResolver: ApiCapabilityResolver,
  ) {}

  /**
   * Resolves capabilities without persisting (useful for connection tests).
   */
  resolveCapabilities(apiVersion: string): ResolvedCapabilities {
    return this.apiCapabilityResolver.resolve(apiVersion, '1.0');
  }

  /**
   * Performs capability resolution and persists results to the database.
   * Fills both the new JSON capabilities field, capabilityHash, and legacy boolean columns.
   */
  async scanAndPersist(
    panelId: string,
    apiVersion: string,
  ): Promise<PanelCapabilities> {
    this.logger.log(
      `[CAP_SERVICE] Scanning and persisting capabilities for panel ${panelId} (API: ${apiVersion})...`,
    );

    const { capabilities, hash } = this.apiCapabilityResolver.resolve(
      apiVersion,
      '1.0',
    );

    await this.prisma.panel.update({
      where: { id: panelId },
      data: {
        capabilities,
        apiVersion,
        capabilitySchemaVersion: '1.0',
        lastCapabilityScan: new Date(),
        capabilityHash: hash,

        // Transitional Migration: Populate both new and legacy columns
        capClientsApi: !!capabilities.clientsApi,
        capPagination: !!capabilities.pagination,
        capSlimInbounds: !!capabilities.slimInbounds,
        capObservatory: !!capabilities.observatory,
        capWebsocket: !!capabilities.websocket,
        capBulkEnable: !!capabilities.bulkEnable,
        capBulkDisable: !!capabilities.bulkDisable,
        capBulkExport: !!capabilities.bulkExport,
      },
    });

    this.logger.log(
      `[CAP_SERVICE] Successfully updated capabilities for panel ${panelId}`,
    );
    return capabilities;
  }
}
