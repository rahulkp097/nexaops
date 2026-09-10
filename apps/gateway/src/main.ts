import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Phase 24 (spec §33: "Keep API contracts versioned"). URI versioning
  // (not header/media-type) so the version is visible in every request
  // without relying on a client to set anything beyond the URL — every
  // resource controller added so far (auth/documents/conversations/admin/
  // evaluation) has no explicit @Controller version, so defaultVersion
  // applies to all of them uniformly; only the health probe opts out via
  // VERSION_NEUTRAL.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Phase 22 (spec §31: "Security headers"). This is a pure JSON/SSE API,
  // never an HTML renderer, so a strict default Content-Security-Policy
  // (helmet's default) costs nothing and blocks nothing real — the other
  // defaults (X-Content-Type-Options, X-Frame-Options, a conservative
  // Referrer-Policy, HSTS once actually served over TLS) are standard
  // defense-in-depth for any response a browser could ever be pointed at
  // directly, e.g. an error page.
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',');
  app.enableCors({ origin: corsOrigins, credentials: true });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Gateway listening on port ${port}`);
}

bootstrap();
