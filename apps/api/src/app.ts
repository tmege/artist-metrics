import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { loggerConfig } from "./lib/logger.js";
import { loadEnv, type Env } from "./config/env.js";
import { registerCors } from "./plugins/cors.js";
import { registerHelmet } from "./plugins/helmet.js";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { registerDb } from "./plugins/db.js";
import { registerAuth } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { artistRoutes } from "./routes/artists.js";
import { socialAccountRoutes } from "./routes/social-accounts.js";
import { oauthRoutes } from "./routes/oauth.js";
import { startSyncJob } from "./jobs/sync-metrics.js";

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
  }
}

export async function buildApp() {
  const env = loadEnv();

  const app = Fastify({
    logger: loggerConfig,
  });

  // Decorate env for access in routes
  app.decorate("env", env);

  // Core plugins
  await app.register(sensible);
  await registerCors(app, env);
  await registerHelmet(app);
  await registerRateLimit(app);

  // Database
  await app.register(registerDb, { databaseUrl: env.DATABASE_URL });

  // Auth
  await app.register(registerAuth, {
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(artistRoutes);
  await app.register(socialAccountRoutes);
  await app.register(oauthRoutes);

  // Start background sync job after server is ready
  app.addHook("onReady", () => {
    startSyncJob(app.db, env, app.log);
  });

  return { app, env };
}
