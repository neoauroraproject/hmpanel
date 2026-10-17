import { setOpenApiDocument, v1OpenApiDocument } from './openapi-holder';

describe('v1 OpenAPI document', () => {
  it('keeps only /v1 routes and points servers at the /api prefix', () => {
    setOpenApiDocument({
      openapi: '3.0.0',
      info: { title: 'Panel API', version: '1.0' },
      paths: {
        '/v1/clients/lookup': { get: {} },
        '/v1/keys': { post: {} },
        '/admins': { get: {} },
        '/premium-modules/store': { get: {} },
      },
      components: {},
    } as never);
    const doc = v1OpenApiDocument()!;
    expect(Object.keys(doc.paths)).toEqual(['/v1/clients/lookup', '/v1/keys']);
    expect(doc.servers).toEqual([{ url: '/api' }]);
    expect(doc.info.title).toContain('v1');
  });
});
