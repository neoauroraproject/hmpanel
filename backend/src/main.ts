import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import axios from 'axios';
import * as https from 'https';

// Prisma returns BigInt for traffic counters; make them JSON-serializable.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ exposedHeaders: ['Content-Disposition'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Panel API')
    .setDescription('Multi-server 3x-ui reseller management panel API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // ── Raw Express middleware for /sub/* asset proxy ──────────────
  // NestJS v11 @Get('*') doesn't match multi-segment paths,
  // so we register directly on the Express instance.
  const logger = new Logger('SubAssetProxy');
  const prisma = app.get(PrismaService);
  const expressApp = app.getHttpAdapter().getInstance();

  // Create shared agents to reuse connections and avoid TCP/SSL handshake bottlenecks
  // when the browser requests dozens of assets concurrently.
  const sharedHttpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
  });
  const sharedHttpAgent = new (require('http').Agent)({ keepAlive: true });

  expressApp.use('/sub', async (req: any, res: any, next: any) => {
    // Only handle GET requests for assets
    if (req.method !== 'GET') return next();

    try {
      // req.path is relative to mount point, e.g. "/assets/vendor.js"
      const assetPath = req.path.replace(/^\//, '');
      if (!assetPath) {
        return res.status(400).send('No asset path');
      }

      const panels = await prisma.panel.findMany({
        where: { status: 'ONLINE' },
      });
      const allPanels =
        panels.length > 0 ? panels : await prisma.panel.findMany();

      if (allPanels.length === 0) {
        return res.status(404).send('No panel available');
      }

      let lastError = null;

      for (const panel of allPanels) {
        const panelSubUrl = panel.subUrl || panel.url || '';
        let base = '';
        try {
          const pUrl = new URL(panelSubUrl);
          const pathname = pUrl.pathname;
          const subIdx = pathname.indexOf('/sub');
          if (subIdx !== -1) {
            base = `${pUrl.origin}${pathname.substring(0, subIdx)}/sub/`;
          } else {
            base = `${pUrl.origin}${pathname.endsWith('/') ? pathname : pathname + '/'}sub/`;
          }
        } catch {
          base = `http://${panelSubUrl.replace(/\/+$/, '')}/sub/`;
        }

        const assetUrl = `${base}${assetPath}`;

        try {
          const response = await axios.get(assetUrl, {
            httpsAgent: sharedHttpsAgent,
            httpAgent: sharedHttpAgent,
            responseType: 'stream',
            timeout: 15000,
          });

          const fwdHeaders = [
            'content-type',
            'content-length',
            'cache-control',
            'last-modified',
            'etag',
          ];
          for (const h of fwdHeaders) {
            if (response.headers[h]) {
              res.setHeader(h, response.headers[h]);
            }
          }
          return response.data.pipe(res);
        } catch (err: any) {
          lastError = err;
          // Try next panel
        }
      }

      if (lastError) {
        logger.error(
          `Sub asset proxy failed for ${assetPath}: ${lastError.message}`,
        );
      }
      res.status(404).send('Asset not found');
    } catch (err: any) {
      logger.error('Sub asset proxy error', err.message);
      res.status(500).send('Internal error');
    }
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger UI on http://localhost:${port}/api`);
}
bootstrap();
