import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function setupApp(app: INestApplication) {
  const corsOrigins = app.get(ConfigService).get<string[]>('CORS_ORIGINS');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (corsOrigins?.length) {
    app.enableCors({ origin: corsOrigins, methods: ['GET', 'HEAD', 'POST'], maxAge: 600 });
  }
}
