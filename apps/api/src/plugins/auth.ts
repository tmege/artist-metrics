import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    user: { id: string; email: string };
  }
}

async function authPlugin(
  app: FastifyInstance,
  opts: { supabaseUrl: string; supabaseServiceRoleKey: string }
) {
  const supabase = createClient(opts.supabaseUrl, opts.supabaseServiceRoleKey);

  app.decorate("authenticate", async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw app.httpErrors.unauthorized("Missing or invalid authorization header");
    }

    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw app.httpErrors.unauthorized("Invalid or expired token");
    }

    // Upsert user in our DB (mirror of auth.users)
    const existing = await app.db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (existing.length === 0) {
      await app.db.insert(users).values({
        id: user.id,
        email: user.email!,
        displayName: user.user_metadata?.full_name || null,
        avatarUrl: user.user_metadata?.avatar_url || null,
      });
    }

    request.user = { id: user.id, email: user.email! };
  });
}

export const registerAuth = fp(authPlugin, {
  name: "auth",
  dependencies: ["@fastify/sensible"],
});
