import {
  extractRawLinkUrisFromHtml,
  looksLikeSubscriptionHtml,
} from './native-sub-html-links';

describe('native-sub-html-links', () => {
  it('extracts .raw-link nodes like neo templates', () => {
    const html = `
      <div id="raw-links-container">
        <div class="raw-link">vless://uuid@cdn.example.com:443?type=ws&amp;security=tls#payg-1215-%F0%9F%9A%80%20NL%20Netherland%20(CDN)</div>
        <div class="raw-link">vless://uuid@us.example.com:443?security=reality#payg-1215-%F0%9F%8C%90%20us%20United%20States</div>
      </div>
    `;
    const links = extractRawLinkUrisFromHtml(html);
    expect(links).toHaveLength(2);
    expect(links[0]).toContain('cdn.example.com');
    expect(links[0]).toContain('type=ws&security=tls');
    expect(links[0]).toContain('#payg-1215-');
    expect(links[1]).toContain('us.example.com');
  });

  it('falls back to protocol URIs when raw-link is absent', () => {
    const html = `<html><body>vless://a@host.example:443?encryption=none#Name</body></html>`;
    expect(extractRawLinkUrisFromHtml(html)).toEqual([
      'vless://a@host.example:443?encryption=none#Name',
    ]);
  });

  it('detects subscription HTML pages', () => {
    expect(looksLikeSubscriptionHtml('<div class="raw-link">vless://x</div>')).toBe(
      true,
    );
    expect(looksLikeSubscriptionHtml('dmxlc3M6Ly9hYmM=')).toBe(false);
  });
});
