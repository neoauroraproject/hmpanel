import { Injectable } from '@nestjs/common';
import {
  matchesAction,
  parsePermissionList,
  RESELLER_DEFAULTS,
  type PermissionAction,
  type PermissionActor,
  type PermissionScope,
} from './permission.catalog';

@Injectable()
export class PermissionEngine {
  can(
    actor: PermissionActor,
    action: PermissionAction | string,
    scope?: PermissionScope,
  ): boolean {
    if (!actor) return false;
    if (actor.role === 'SUPER_ADMIN') return true;

    const extra = parsePermissionList(actor.permissions);
    const granted = [...RESELLER_DEFAULTS, ...extra];
    const allowed = granted.some((g) => matchesAction(g, action));
    if (!allowed) return false;

    if (!scope || scope.kind === 'all' || scope.kind === 'own') return true;
    if (scope.kind === 'assigned') return true;

    if (scope.kind === 'inbound' && scope.id) {
      if (!actor.inboundIds || actor.inboundIds.length === 0) return false;
      return actor.inboundIds.includes(scope.id);
    }
    if (scope.kind === 'panel' && scope.id) {
      if (!actor.panelIds || actor.panelIds.length === 0) return false;
      return actor.panelIds.includes(scope.id);
    }
    if (scope.kind === 'group' && scope.id) {
      if (!actor.inboundIds || actor.inboundIds.length === 0) return false;
      return actor.inboundIds.includes(scope.id);
    }
    return true;
  }
}
