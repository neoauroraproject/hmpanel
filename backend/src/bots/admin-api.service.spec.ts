import { AdminApiService } from './admin-api.service';

const GB = 1024 ** 3;
const DAY = 86_400_000;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    email: 'ali',
    remark: null,
    subId: 'sub1',
    subToken: 'tok1',
    enable: true,
    disableReason: null,
    up: BigInt(GB),
    down: BigInt(2 * GB),
    total: BigInt(10 * GB),
    expiryTime: BigInt(Date.now() + 5 * DAY),
    limitIp: 0,
    admin: { id: 'a1', username: 'ali' },
    panel: { id: 'p1', name: 'DE', panelType: '3x-ui', subUrl: null },
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup(client = row()) {
  const prisma = {
    client: {
      findFirst: jest.fn().mockResolvedValue(client),
      findUnique: jest.fn().mockResolvedValue(client),
    },
  };
  const clients = {
    findOne: jest.fn().mockResolvedValue(client),
    update: jest.fn().mockResolvedValue({}),
    resetUsage: jest.fn().mockResolvedValue({}),
  };
  const moduleRef = { get: () => clients };
  const svc = new AdminApiService(prisma as never, moduleRef as never);
  return { svc, prisma, clients };
}

describe('AdminApiService', () => {
  it('scopes lookups to the reseller and searches every subscription key', async () => {
    const { svc, prisma } = setup();
    const out = await svc.lookup({ adminId: 'a1', role: 'RESELLER' }, 'tok1', 'https://p.io');
    const where = prisma.client.findFirst.mock.calls[0][0].where;
    expect(where.adminId).toBe('a1');
    expect(where.OR).toEqual(
      expect.arrayContaining([{ subToken: 'tok1' }, { subId: 'tok1' }, { email: 'tok1' }]),
    );
    expect(out.subscriptionUrl).toBe('https://p.io/s/tok1');
    expect(out.remainingBytes).toBe(7 * GB);
    expect(out.status).toBe('active');
  });

  it('lets super admins look up any client', async () => {
    const { svc, prisma } = setup();
    await svc.lookup({ adminId: 'root', role: 'SUPER_ADMIN' }, 'tok1', 'https://p.io');
    expect(prisma.client.findFirst.mock.calls[0][0].where.adminId).toBeUndefined();
  });

  it('renews from the current expiry when it is still in the future', async () => {
    const expiry = Date.now() + 5 * DAY;
    const { svc, clients } = setup(row({ expiryTime: BigInt(expiry) }));
    await svc.renew({ adminId: 'a1', role: 'RESELLER' }, 'c1', { days: 30, totalGb: 50, resetUsage: true }, 'https://p.io');
    const patch = clients.update.mock.calls[0][3];
    expect(patch.expiryTime).toBe(expiry + 30 * DAY);
    expect(patch.total).toBe(50 * GB);
    expect(patch.enable).toBe(true);
    expect(clients.update.mock.calls[0].slice(1, 3)).toEqual(['a1', 'RESELLER']);
    expect(clients.resetUsage).toHaveBeenCalledWith('c1', 'a1', 'RESELLER');
  });

  it('renews from now when the client already expired', async () => {
    const { svc, clients } = setup(row({ expiryTime: BigInt(Date.now() - 10 * DAY) }));
    const before = Date.now();
    await svc.renew({ adminId: 'a1', role: 'RESELLER' }, 'c1', { days: 7 }, 'https://p.io');
    const patch = clients.update.mock.calls[0][3];
    expect(patch.expiryTime).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(patch.total).toBeUndefined();
    expect(clients.resetUsage).not.toHaveBeenCalled();
  });

  it('reports limited when the quota is used up', async () => {
    const { svc } = setup(row({ up: BigInt(6 * GB), down: BigInt(5 * GB) }));
    const out = await svc.lookup({ adminId: 'a1', role: 'RESELLER' }, 'tok1', 'https://p.io');
    expect(out.status).toBe('limited');
    expect(out.remainingBytes).toBe(0);
  });
});
