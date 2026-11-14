import { loadEnv } from './config/env.js';
import { connectDatabase } from './config/db.js';
import { createApp } from './app.js';

async function startServer() {
  const env = loadEnv();
  await connectDatabase(env.mongoUri);

  const app = createApp({ clientUrl: env.clientUrl, jwtSecret: env.jwtSecret });
  app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
