import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { artists, socialAccounts, socialMetrics } from "../db/schema.js";

export async function artistRoutes(app: FastifyInstance) {
  // All artist routes require authentication
  app.addHook("onRequest", app.authenticate);

  // GET /artists — list user's artists
  app.get("/artists", async (request) => {
    const rows = await app.db
      .select()
      .from(artists)
      .where(eq(artists.userId, request.user.id))
      .orderBy(desc(artists.createdAt));

    return { data: rows };
  });

  // POST /artists — create an artist
  app.post<{ Body: { name: string; imageUrl?: string } }>(
    "/artists",
    async (request, reply) => {
      const { name, imageUrl } = request.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return reply.badRequest("name is required");
      }

      const [artist] = await app.db
        .insert(artists)
        .values({
          userId: request.user.id,
          name: name.trim(),
          imageUrl: imageUrl || null,
        })
        .returning();

      return reply.code(201).send({ data: artist });
    }
  );

  // GET /artists/:id — artist detail with social accounts + latest metrics
  app.get<{ Params: { id: string } }>(
    "/artists/:id",
    async (request, reply) => {
      const { id } = request.params;

      const artist = await app.db.query.artists.findFirst({
        where: and(eq(artists.id, id), eq(artists.userId, request.user.id)),
        with: {
          socialAccounts: true,
        },
      });

      if (!artist) {
        return reply.notFound("Artist not found");
      }

      // Fetch latest metrics for each social account
      const accountsWithMetrics = await Promise.all(
        artist.socialAccounts.map(async (account) => {
          const [latestMetric] = await app.db
            .select()
            .from(socialMetrics)
            .where(eq(socialMetrics.socialAccountId, account.id))
            .orderBy(desc(socialMetrics.fetchedAt))
            .limit(1);

          return {
            ...account,
            // Strip encrypted tokens from response
            accessToken: undefined,
            refreshToken: undefined,
            latestMetrics: latestMetric || null,
          };
        })
      );

      return {
        data: {
          ...artist,
          socialAccounts: accountsWithMetrics,
        },
      };
    }
  );

  // PUT /artists/:id — update artist
  app.put<{ Params: { id: string }; Body: { name?: string; imageUrl?: string } }>(
    "/artists/:id",
    async (request, reply) => {
      const { id } = request.params;
      const { name, imageUrl } = request.body;

      const existing = await app.db.query.artists.findFirst({
        where: and(eq(artists.id, id), eq(artists.userId, request.user.id)),
      });

      if (!existing) {
        return reply.notFound("Artist not found");
      }

      const [updated] = await app.db
        .update(artists)
        .set({
          ...(name !== undefined && { name: name.trim() }),
          ...(imageUrl !== undefined && { imageUrl }),
          updatedAt: new Date(),
        })
        .where(eq(artists.id, id))
        .returning();

      return { data: updated };
    }
  );

  // DELETE /artists/:id — delete artist (cascades to social accounts + metrics)
  app.delete<{ Params: { id: string } }>(
    "/artists/:id",
    async (request, reply) => {
      const { id } = request.params;

      const existing = await app.db.query.artists.findFirst({
        where: and(eq(artists.id, id), eq(artists.userId, request.user.id)),
      });

      if (!existing) {
        return reply.notFound("Artist not found");
      }

      await app.db.delete(artists).where(eq(artists.id, id));

      return reply.code(204).send();
    }
  );
}
