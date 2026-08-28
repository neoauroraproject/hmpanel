import {
  derivePanelConnectionFromUrl,
  panelEndpointFieldsFromUrl,
  panelEndpointFieldsMatchStored,
  resolvePanelApiBaseUrl,
} from './panel-url.util';

describe('panel-url.util', () => {
  describe('derivePanelConnectionFromUrl', () => {
    it('parses a panel at domain root', () => {
      const derived = derivePanelConnectionFromUrl('https://node.example.com/panel/');
      expect(derived).toEqual({
        normalizedUrl: 'https://node.example.com/panel',
        webBasePath: '',
        apiBaseUrl: 'https://node.example.com',
      });
    });

    it('parses a panel under a web base path', () => {
      const derived = derivePanelConnectionFromUrl(
        'https://node.example.com/xui/panel/login',
      );
      expect(derived).toEqual({
        normalizedUrl: 'https://node.example.com/xui/panel/login',
        webBasePath: '/xui',
        apiBaseUrl: 'https://node.example.com/xui',
      });
    });

    it('strips trailing slash from normalized url', () => {
      const derived = derivePanelConnectionFromUrl('https://a.example.com/');
      expect(derived.normalizedUrl).toBe('https://a.example.com');
      expect(derived.apiBaseUrl).toBe('https://a.example.com');
    });
  });

  describe('resolvePanelApiBaseUrl', () => {
    it('derives from url even when stored apiBaseUrl is stale', () => {
      const apiBaseUrl = resolvePanelApiBaseUrl({
        url: 'https://new.example.com/panel',
        apiBaseUrl: 'https://old.example.com',
        webBasePath: '',
      });
      expect(apiBaseUrl).toBe('https://new.example.com');
    });

    it('matches register() storage for prefixed panels', () => {
      const url = 'https://host.example.com/custom/panel';
      const derived = panelEndpointFieldsFromUrl(url);
      expect(resolvePanelApiBaseUrl({ url, ...derived })).toBe(
        'https://host.example.com/custom',
      );
    });
  });

  describe('panelEndpointFieldsMatchStored', () => {
    it('detects stale derived fields after url edit', () => {
      const derived = derivePanelConnectionFromUrl('https://new.example.com/panel');
      expect(
        panelEndpointFieldsMatchStored(
          {
            url: 'https://new.example.com/panel',
            apiBaseUrl: 'https://old.example.com',
            webBasePath: '',
          },
          derived,
        ),
      ).toBe(false);
    });

    it('accepts consistent stored fields', () => {
      const derived = derivePanelConnectionFromUrl('https://node.example.com/panel');
      expect(
        panelEndpointFieldsMatchStored(
          {
            url: derived.normalizedUrl,
            apiBaseUrl: derived.apiBaseUrl,
            webBasePath: derived.webBasePath,
          },
          derived,
        ),
      ).toBe(true);
    });
  });
});
