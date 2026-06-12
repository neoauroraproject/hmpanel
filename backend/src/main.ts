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
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

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

  expressApp.get('/sub/*', async (req: any, res: any) => {
    try {
      const fullPath = req.originalUrl.replace(/^\/sub\//, '');
      if (!fullPath) {
        return res.status(400).send('No asset path');
      }

      const panels = await prisma.panel.findMany({
        where: { status: 'ONLINE' },
      });
      const allPanels = panels.length > 0 ? panels : await prisma.panel.findMany();

      if (allPanels.length === 0) {
        return res.status(404).send('No panel available');
      }

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

        const assetUrl = `${base}${fullPath}`;

        try {
          const response = await axios.get(assetUrl, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            responseType: 'stream',
            timeout: 5000,
          });

          const fwdHeaders = ['content-type', 'content-length', 'cache-control', 'last-modified', 'etag'];
          for (const h of fwdHeaders) {
            if (response.headers[h]) {
              res.setHeader(h, response.headers[h]);
            }
          }
          return response.data.pipe(res);
        } catch {
          // Try next panel
        }
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
