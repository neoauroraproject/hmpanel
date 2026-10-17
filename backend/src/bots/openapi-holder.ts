import type { OpenAPIObject } from '@nestjs/swagger';

/** main.ts builds the Swagger document after the app exists; controllers read it here. */
let document: OpenAPIObject | null = null;

export function setOpenApiDocument(doc: OpenAPIObject) {
  document = doc;
}

/** Only the key-authenticated /v1 routes (plus the key-management ones). */
export function v1OpenApiDocument(): OpenAPIObject | null {
  if (!document) return null;
  const paths = Object.fromEntries(Object.entries(document.paths).filter(([p]) => p.startsWith('/v1/')));
  return {
    ...document,
    info: {
      ...document.info,
      title: 'HMPanel Admin API (v1)',
      description:
        'Per-admin API keys. Send `Authorization: Bearer hmp_…`. A key acts exactly as the admin who owns it. ' +
        'Paths are relative to https://<panel>/api. Guide: docs/admin-api.md',
    },
    servers: [{ url: '/api' }],
    paths,
  };
}

/** True once the premium bundle has registered its /v1/premium routes. */
export function hasPremiumApiRoutes(): boolean {
  return !!document && Object.keys(document.paths).some((p) => p.startsWith('/v1/premium'));
}
