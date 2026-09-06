import { PermissionEngine } from './permission.engine';
import type { PermissionActor } from './permission.catalog';

const superAdmin: PermissionActor = { id: 's', role: 'SUPER_ADMIN' };
const reseller: PermissionActor = {
  id: 'r',
  role: 'RESELLER',
  inboundIds: ['inb-1'],
  panelIds: ['p-1'],
};

describe('PermissionEngine', () => {
  const engine = new PermissionEngine();

  it('grants SUPER_ADMIN every action and scope', () => {
    expect(engine.can(superAdmin, 'settings.manage', { kind: 'all' })).toBe(true);
    expect(engine.can(superAdmin, 'users.delete', { kind: 'inbound', id: 'x' })).toBe(
      true,
    );
  });

  it('gives RESELLER default user actions on assigned inbounds', () => {
    expect(engine.can(reseller, 'users.create', { kind: 'inbound', id: 'inb-1' })).toBe(
      true,
    );
    expect(engine.can(reseller, 'users.create', { kind: 'inbound', id: 'other' })).toBe(
      false,
    );
  });

  it('denies reseller settings and honors extra JSON permissions', () => {
    expect(engine.can(reseller, 'settings.manage')).toBe(false);
    const withJson: PermissionActor = {
      ...reseller,
      permissions: ['settings.*'],
    };
    expect(engine.can(withJson, 'settings.manage')).toBe(true);
  });
});
