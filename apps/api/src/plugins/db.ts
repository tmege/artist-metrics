import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { createDb, type Database } from "../db/index.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

async function dbPlugin(app: FastifyInstance, opts: { databaseUrl: string }) {
  const db = createDb(opts.databaseUrl);
  app.decorate("db", db);
}

export const registerDb = fp(dbPlugin, { name: "db" });
