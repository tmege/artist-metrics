import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";

export async function registerCors(app: FastifyInstance, env: Env) {
  await app.register(cors, {
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
}
