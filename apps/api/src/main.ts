import { NestFactory } from '@nestjs/core';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './modules/app.module';

const envCandidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
const envPath = envCandidates.find((candidate) => existsSync(candidate));

if (envPath) {
  loadEnv({ path: envPath });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT || 4000);
}
bootstrap();
