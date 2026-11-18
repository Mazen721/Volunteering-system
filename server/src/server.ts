import { loadEnv } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { createApp } from './app.js';

async function startServer(): Promise<void> {
  const env = loadEnv();
  await connectDatabase(env.mongoUri);

  const app = createApp({
    clientUrl: env.clientUrl,
    jwtSecret: env.jwtSecret,
    allowedEmailDomains: env.allowedEmailDomains,
  });
  app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}`);
  });
}

startServer().catch((err: unknown) => {
  console.error('Failed to start server:', err instanceof Error ? err.message : err);
  process.exit(1);
});
