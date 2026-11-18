import { getLicenseDeviceInfo, parseOsRelease } from './license-device-info.util';

describe('license device info', () => {
  it('reads PRETTY_NAME from os-release', () => {
    expect(parseOsRelease('NAME="Ubuntu"\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04 LTS"\n')).toBe(
      'Ubuntu 24.04 LTS',
    );
  });

  it('falls back to NAME + VERSION_ID', () => {
    expect(parseOsRelease('# comment\nNAME=Debian\r\nVERSION_ID=12\r\n')).toBe('Debian 12');
  });

  it('always reports os and arch', () => {
    const info = getLicenseDeviceInfo();
    expect(info.os).toBeTruthy();
    expect(info.arch).toBeTruthy();
    expect(info.arch).not.toBe('x64');
  });
});
