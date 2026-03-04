import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { artists, socialAccounts, socialMetrics } from "../db/schema.js";
import {
  resolveChannelId,
  getChannelStats,
  getChannelStatsPublic,
  getRecentVideos,
} from "../services/youtube.js";
import { resolveInstagramUsername } from "../services/instagram.js";
import { resolveTikTokUsername } from "../services/tiktok.js";

// Rate limit: 1 sync per 15 minutes per account
const syncCooldowns = new Map<string, number>();
const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

export async function socialAccountRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  // Verify artist ownership helper
  async function verifyArtistOwnership(artistId: string, userId: string) {
    return app.db.query.artists.findFirst({
      where: and(eq(artists.id, artistId), eq(artists.userId, userId)),
    });
  }

  // POST /artists/:id/social-accounts — link a social account
  app.post<{
    Params: { id: string };
    Body: { platform: "youtube" | "instagram" | "tiktok"; url: string };
  }>("/artists/:id/social-accounts", async (request, reply) => {
    const { id } = request.params;
    const { platform, url } = request.body;

    if (!["youtube", "instagram", "tiktok"].includes(platform)) {
      return reply.badRequest("Invalid platform");
    }
    if (!url || typeof url !== "string") {
      return reply.badRequest("url is required");
    }

    const artist = await verifyArtistOwnership(id, request.user.id);
    if (!artist) return reply.notFound("Artist not found");

    // Check if platform already connected
    const existing = await app.db.query.socialAccounts.findFirst({
      where: and(
        eq(socialAccounts.artistId, id),
        eq(socialAccounts.platform, platform)
      ),
    });
    if (existing) {
      return reply.conflict("This platform is already connected for this artist");
    }

    let platformAccountId: string;
    let username: string | null = null;

    const env = app.env;

    if (platform === "youtube") {
      // Use API key if available, otherwise scrape public page
      if (env.YOUTUBE_API_KEY) {
        platformAccountId = await resolveChannelId(url, env.YOUTUBE_API_KEY);
        const stats = await getChannelStats(platformAccountId, env.YOUTUBE_API_KEY);
        username = stats.customUrl || stats.title;

        const [account] = await app.db
          .insert(socialAccounts)
          .values({
            artistId: id,
            platform: "youtube",
            platformAccountId,
            username,
            isOAuthConnected: false,
          })
          .returning();

        await app.db.insert(socialMetrics).values({
          socialAccountId: account.id,
          followers: stats.subscriberCount,
          views: stats.viewCount,
          posts: stats.videoCount,
          likes: null,
          engagementRate: null,
          platformData: {
            title: stats.title,
            thumbnailUrl: stats.thumbnailUrl,
          },
        });

        return reply.code(201).send({ data: account });
      }

      // Public scraping fallback (no API key)
      const stats = await getChannelStatsPublic(url);
      platformAccountId = stats.channelId;
      username = stats.customUrl || stats.title;

      const [account] = await app.db
        .insert(socialAccounts)
        .values({
          artistId: id,
          platform: "youtube",
          platformAccountId,
          username,
          isOAuthConnected: false,
        })
        .returning();

      await app.db.insert(socialMetrics).values({
        socialAccountId: account.id,
        followers: stats.subscriberCount,
        views: stats.viewCount,
        posts: stats.videoCount,
        likes: null,
        engagementRate: null,
        platformData: {
          title: stats.title,
          thumbnailUrl: stats.thumbnailUrl,
        },
      });

      return reply.code(201).send({ data: account });
    }

    if (platform === "instagram") {
      const resolved = resolveInstagramUsername(url);
      platformAccountId = resolved;
      username = resolved;

      const [account] = await app.db
        .insert(socialAccounts)
        .values({
          artistId: id,
          platform: "instagram",
          platformAccountId,
          username,
          isOAuthConnected: false,
        })
        .returning();

      return reply.code(201).send({ data: account });
    }

    if (platform === "tiktok") {
      const resolved = resolveTikTokUsername(url);
      platformAccountId = resolved;
      username = resolved;

      const [account] = await app.db
        .insert(socialAccounts)
        .values({
          artistId: id,
          platform: "tiktok",
          platformAccountId,
          username,
          isOAuthConnected: false,
        })
        .returning();

      return reply.code(201).send({ data: account });
    }

    return reply.badRequest("Unsupported platform");
  });

  // DELETE /artists/:id/social-accounts/:accountId — unlink
  app.delete<{ Params: { id: string; accountId: string } }>(
    "/artists/:id/social-accounts/:accountId",
    async (request, reply) => {
      const { id, accountId } = request.params;

      const artist = await verifyArtistOwnership(id, request.user.id);
      if (!artist) return reply.notFound("Artist not found");

      const account = await app.db.query.socialAccounts.findFirst({
        where: and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.artistId, id)
        ),
      });
      if (!account) return reply.notFound("Social account not found");

      await app.db
        .delete(socialAccounts)
        .where(eq(socialAccounts.id, accountId));

      return reply.code(204).send();
    }
  );

  // GET /artists/:id/social-accounts/:accountId/metrics — history
  app.get<{
    Params: { id: string; accountId: string };
    Querystring: { limit?: string };
  }>(
    "/artists/:id/social-accounts/:accountId/metrics",
    async (request, reply) => {
      const { id, accountId } = request.params;
      const limit = Math.min(Number(request.query.limit) || 50, 200);

      const artist = await verifyArtistOwnership(id, request.user.id);
      if (!artist) return reply.notFound("Artist not found");

      const metrics = await app.db
        .select()
        .from(socialMetrics)
        .where(eq(socialMetrics.socialAccountId, accountId))
        .orderBy(desc(socialMetrics.fetchedAt))
        .limit(limit);

      return { data: metrics };
    }
  );

  // POST /artists/:id/social-accounts/:accountId/sync — manual sync
  app.post<{ Params: { id: string; accountId: string } }>(
    "/artists/:id/social-accounts/:accountId/sync",
    async (request, reply) => {
      const { id, accountId } = request.params;

      const artist = await verifyArtistOwnership(id, request.user.id);
      if (!artist) return reply.notFound("Artist not found");

      const account = await app.db.query.socialAccounts.findFirst({
        where: and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.artistId, id)
        ),
      });
      if (!account) return reply.notFound("Social account not found");

      // Rate limit check
      const lastSync = syncCooldowns.get(accountId);
      if (lastSync && Date.now() - lastSync < SYNC_COOLDOWN_MS) {
        const remaining = Math.ceil(
          (SYNC_COOLDOWN_MS - (Date.now() - lastSync)) / 60000
        );
        return reply.tooManyRequests(
          `Please wait ${remaining} minutes before syncing again`
        );
      }

      const env = app.env;

      if (account.platform === "youtube") {
        if (!env.YOUTUBE_API_KEY) {
          return reply.badRequest("YouTube API key not configured");
        }
        const stats = await getChannelStats(
          account.platformAccountId,
          env.YOUTUBE_API_KEY
        );

        const videos = await getRecentVideos(
          account.platformAccountId,
          env.YOUTUBE_API_KEY,
          5
        );
        const totalLikes = videos.reduce((sum, v) => sum + v.likeCount, 0);

        await app.db.insert(socialMetrics).values({
          socialAccountId: account.id,
          followers: stats.subscriberCount,
          views: stats.viewCount,
          posts: stats.videoCount,
          likes: totalLikes,
          engagementRate: null,
          platformData: {
            title: stats.title,
            thumbnailUrl: stats.thumbnailUrl,
            recentVideos: videos,
          },
        });
      }

      // Instagram and TikTok sync when OAuth is connected
      if (
        (account.platform === "instagram" || account.platform === "tiktok") &&
        account.isOAuthConnected &&
        account.accessToken
      ) {
        // OAuth sync handled by the sync job / oauth services
        // For now, just mark the sync timestamp
      }

      syncCooldowns.set(accountId, Date.now());
      return { data: { synced: true } };
    }
  );
}
