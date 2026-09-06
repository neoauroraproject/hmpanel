import { Injectable } from '@nestjs/common';

/**
 * Hook points so core WS metrics and Monitoring Pro can share one snapshot later.
 * Phase 4: adapters push samples here; UI reads unified state.
 */
export interface UnifiedMetricSample {
  panelId: string;
  source: 'core' | 'pro';
  cpu?: number;
  memory?: number;
  onlineUsers?: number;
  recordedAt: string;
}

@Injectable()
export class UnifiedMonitoringHub {
  private readonly latest = new Map<string, UnifiedMetricSample>();

  ingest(sample: UnifiedMetricSample): void {
    this.latest.set(`${sample.source}:${sample.panelId}`, sample);
  }

  snapshot(panelId?: string): UnifiedMetricSample[] {
    const all = [...this.latest.values()];
    return panelId ? all.filter((s) => s.panelId === panelId) : all;
  }
}
