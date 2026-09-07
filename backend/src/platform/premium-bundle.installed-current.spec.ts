import { PremiumBundleService } from './premium-bundle.service';

describe('PremiumBundleService.isInstalledCurrent', () => {
  const service = new PremiumBundleService();

  beforeEach(() => {
    jest.spyOn(service, 'isBundleInstalled').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false when versions differ', () => {
    jest.spyOn(service, 'getInstalledVersion').mockReturnValue('2.2.0');
    jest.spyOn(service, 'getInstalledSha256').mockReturnValue('aaa');
    expect(service.isInstalledCurrent('2.2.1', 'aaa')).toBe(false);
  });

  it('returns false when same version but sha differs', () => {
    jest.spyOn(service, 'getInstalledVersion').mockReturnValue('2.2.0');
    jest.spyOn(service, 'getInstalledSha256').mockReturnValue('oldsha');
    expect(service.isInstalledCurrent('2.2.0', 'newsha')).toBe(false);
  });

  it('returns true when version and sha match', () => {
    jest.spyOn(service, 'getInstalledVersion').mockReturnValue('2.2.0');
    jest.spyOn(service, 'getInstalledSha256').mockReturnValue('abc123');
    expect(service.isInstalledCurrent('2.2.0', 'ABC123')).toBe(true);
  });

  it('returns true when remote sha missing but version matches', () => {
    jest.spyOn(service, 'getInstalledVersion').mockReturnValue('2.2.0');
    jest.spyOn(service, 'getInstalledSha256').mockReturnValue('anything');
    expect(service.isInstalledCurrent('2.2.0', null)).toBe(true);
  });
});
