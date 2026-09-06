/**
 * Sensitive operational flows that Phase 0+ must keep behavior-stable.
 * Inventory is documentation + a testable catalog — it does not change routing.
 */
export type CriticalFlowId =
  | 'clients.create'
  | 'clients.update'
  | 'clients.delete'
  | 'traffic.debit'
  | 'traffic.credit'
  | 'panels.sync'
  | 'panels.testConnection'
  | 'cleanup.run'
  | 'backups.restore';

export interface CriticalFlowEntry {
  id: CriticalFlowId;
  http: string;
  service: string;
  method: string;
  notes: string;
}

export const CRITICAL_FLOWS: CriticalFlowEntry[] = [
  {
    id: 'clients.create',
    http: 'POST /clients',
    service: 'ClientsService',
    method: 'create',
    notes: 'Panel-first provision; dual-write via XuiPanelDriver only when adapter_xui_v1 is on',
  },
  {
    id: 'clients.update',
    http: 'PATCH /clients/:id',
    service: 'ClientsService',
    method: 'update',
    notes: 'Must keep email identity and inbound assignment contracts',
  },
  {
    id: 'clients.delete',
    http: 'DELETE /clients/:id',
    service: 'ClientsService',
    method: 'remove',
    notes: 'Remote delete then DB; refund path unchanged',
  },
  {
    id: 'traffic.debit',
    http: 'POST /traffic (and client create allocation)',
    service: 'AdminQuotaService',
    method: 'debit',
    notes: 'Policy reserve wraps this only when policy_reserve_v1 is on',
  },
  {
    id: 'traffic.credit',
    http: 'POST /traffic credit / client refund',
    service: 'AdminQuotaService',
    method: 'credit',
    notes: 'Refund-on-delete / edit must stay byte-accurate',
  },
  {
    id: 'panels.sync',
    http: 'POST /panels/:id/sync',
    service: 'PanelsService / NativePanelOrchestrator',
    method: 'sync',
    notes: '3x-ui sync stays in PanelsService; Eylan/PG use PanelSyncDriver',
  },
  {
    id: 'panels.testConnection',
    http: 'POST /panels/test',
    service: 'PanelsService',
    method: 'testConnection',
    notes: 'XuiPanelDriver.testConnection delegates here when adapter is used',
  },
  {
    id: 'cleanup.run',
    http: 'POST /clients/cleanup (and settings cleanup)',
    service: 'ClientsService / settings cleanup',
    method: 'cleanup',
    notes: 'Capability-aware later; payload unchanged in phase 1',
  },
  {
    id: 'backups.restore',
    http: 'POST /backups/restore',
    service: 'BackupsService',
    method: 'restore',
    notes: 'Must restore on previous schema via SchemaMigrationAdapter when versions differ',
  },
];

export function getCriticalFlow(id: CriticalFlowId): CriticalFlowEntry {
  const found = CRITICAL_FLOWS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown critical flow: ${id}`);
  return found;
}
