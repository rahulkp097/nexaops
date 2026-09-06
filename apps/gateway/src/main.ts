import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
