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

function getMissingJiraEnvVars() {
  return ['JIRA_BASE_URL', 'JIRA_PAT', 'JIRA_DEFAULT_USER'].filter((key) => !process.env[key]?.trim());
}

async function bootstrap() {
  const missingJiraEnvVars = getMissingJiraEnvVars();
  const rootEnvPath = resolve(process.cwd(), '.env');

  if (missingJiraEnvVars.length > 0) {
    console.warn(
      `[startup] Jira integration is running in setup mode. Missing ${missingJiraEnvVars.join(', ')} in ${rootEnvPath}. Jira-backed routes will return setup guidance until the root .env file is configured.`,
    );
  } else {
    console.log(`[startup] Jira integration configured for ${process.env.JIRA_BASE_URL?.trim()}.`);
  }

  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`[startup] API listening on http://localhost:${port}/api`);
}
bootstrap();
