import {
  extractOnlineEmails,
  extractOnlineIpCounts,
  extractOnlineIpDetails,
  extractHwidDevices,
} from './xui-online-response.util';

describe('extractOnlineEmails', () => {
  it('reads a flat email array', () => {
    expect(extractOnlineEmails(['A@x.com', 'b@x.com', 'a@x.com'])).toEqual([
      'a@x.com',
      'b@x.com',
    ]);
  });

  it('unwraps { obj: [...] } envelopes', () => {
    expect(extractOnlineEmails({ success: true, obj: ['user@x.com'] })).toEqual([
      'user@x.com',
    ]);
  });
});

describe('extractOnlineIpCounts', () => {
  it('counts IP arrays keyed by email', () => {
    expect(
      extractOnlineIpCounts({
        'a@x.com': ['1.1.1.1', '2.2.2.2'],
        'b@x.com': ['3.3.3.3'],
      }),
    ).toEqual({ 'a@x.com': 2, 'b@x.com': 1 });
  });

  it('splits comma-separated IP strings', () => {
    expect(extractOnlineIpCounts({ 'a@x.com': '1.1.1.1, 8.8.8.8' })).toEqual({
      'a@x.com': 2,
    });
  });
});

describe('extractOnlineIpDetails', () => {
  it('returns IP sessions keyed by email', () => {
    expect(
      extractOnlineIpDetails({
        'a@x.com': ['1.1.1.1', '2.2.2.2'],
        'b@x.com': '3.3.3.3, 4.4.4.4',
      }),
    ).toEqual({
      'a@x.com': [
        { ip: '1.1.1.1', device: null, hwid: null },
        { ip: '2.2.2.2', device: null, hwid: null },
      ],
      'b@x.com': [
        { ip: '3.3.3.3', device: null, hwid: null },
        { ip: '4.4.4.4', device: null, hwid: null },
      ],
    });
  });

  it('reads device fields from object rows', () => {
    expect(
      extractOnlineIpDetails([
        {
          email: 'u@x.com',
          ips: [{ ip: '9.9.9.9', device: 'iPhone', hwid: 'abc' }],
        },
      ]),
    ).toEqual({
      'u@x.com': [{ ip: '9.9.9.9', device: 'iPhone', hwid: 'abc' }],
    });
  });
});

describe('extractHwidDevices', () => {
  it('parses hwid device rows', () => {
    expect(
      extractHwidDevices([
        { hwid: 'h1', device: 'Android', ip: '1.2.3.4' },
        'plain-hwid',
      ]),
    ).toEqual([
      { hwid: 'h1', device: 'Android', ip: '1.2.3.4' },
      { hwid: 'plain-hwid', device: null, ip: null },
    ]);
  });
});
