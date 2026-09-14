import {
  extractOnlineEmails,
  extractOnlineIpCounts,
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
