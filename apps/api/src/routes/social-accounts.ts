import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { artists, socialAccounts, socialMetrics } from "../db/schema.js";
import {
  resolveChannelId,
  getChannelStats,
  getChannelStatsPublic,
  getRecentVideos,
  getPopularVideos,
} from "../services/youtube.js";
import { resolveInstagramUsername } from "../services/instagram.js";
import { resolveTikTokUsername } from "../services/tiktok.js";
import { fetchHistory, type HistoryRow } from "../services/socialblade.js";
import {
  extractSpotifyArtistId,
  extractDeezerArtistId,
  extractAppleMusicArtistId,
  extractYouTubeMusicChannelId,
  getSpotifyArtistStats,
  getSpotifyTopTracks,
  getDeezerArtistStats,
  getAppleMusicArtistStats,
} from "../services/streaming.js";

// Rate limit: 1 sync per 15 minutes per account
const syncCooldowns = new Map<string, number>();
const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

// In-memory cache for Social Blade history (TTL 30 min)
const historyCache = new Map<string, { data: HistoryRow[]; ts: number }>();
const HISTORY_CACHE_TTL = 30 * 60 * 1000;

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
    Body: { platform: string; url: string };
  }>("/artists/:id/social-accounts", async (request, reply) => {
    const { id } = request.params;
    const { platform, url } = request.body;

    const ALL_PLATFORMS = ["youtube", "instagram", "tiktok", "spotify", "apple_music", "deezer", "youtube_music"];
    if (!ALL_PLATFORMS.includes(platform)) {
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
        eq(socialAccounts.platform, platform as typeof socialAccounts.platform.enumValues[number])
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

    // ── Spotify (embed + optional API for richer stats) ──
    if (platform === "spotify") {
      try {
        const spotifyId = extractSpotifyArtistId(url);
        const stats = await getSpotifyArtistStats(spotifyId, env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET);
        const topTracks = await getSpotifyTopTracks(spotifyId, 5);

        const [account] = await app.db
          .insert(socialAccounts)
          .values({
            artistId: id,
            platform: "spotify",
            platformAccountId: spotifyId,
            username: stats.name,
            isOAuthConnected: false,
          })
          .returning();

        await app.db.insert(socialMetrics).values({
          socialAccountId: account.id,
          followers: stats.followers > 0 ? stats.followers : null,
          views: null,
          posts: null,
          likes: null,
          engagementRate: null,
          platformData: {
            name: stats.name,
            popularity: stats.popularity,
            genres: stats.genres,
            imageUrl: stats.imageUrl,
            topTracks,
          },
        });

        return reply.code(201).send({ data: account });
      } catch (err) {
        return reply.badRequest(err instanceof Error ? err.message : "Failed to connect Spotify");
      }
    }

    // ── Deezer (free API, no auth) ──
    if (platform === "deezer") {
      try {
        const deezerId = extractDeezerArtistId(url);
        const stats = await getDeezerArtistStats(deezerId);

        const [account] = await app.db
          .insert(socialAccounts)
          .values({
            artistId: id,
            platform: "deezer",
            platformAccountId: deezerId,
            username: stats.name,
            isOAuthConnected: false,
          })
          .returning();

        await app.db.insert(socialMetrics).values({
          socialAccountId: account.id,
          followers: stats.nbFan,
          views: null,
          posts: stats.nbAlbum,
          likes: null,
          engagementRate: null,
          platformData: {
            name: stats.name,
            pictureUrl: stats.pictureUrl,
          },
        });

        return reply.code(201).send({ data: account });
      } catch (err) {
        return reply.badRequest(err instanceof Error ? err.message : "Failed to connect Deezer");
      }
    }

    // ── Apple Music ──
    if (platform === "apple_music") {
      try {
        const appleId = extractAppleMusicArtistId(url);
        const stats = await getAppleMusicArtistStats(appleId);

        const [account] = await app.db
          .insert(socialAccounts)
          .values({
            artistId: id,
            platform: "apple_music",
            platformAccountId: appleId,
            username: stats.name,
            isOAuthConnected: false,
          })
          .returning();

        // Apple Music doesn't expose public metrics (no followers, no streams)
        // Store what we can in platformData for reference
        await app.db.insert(socialMetrics).values({
          socialAccountId: account.id,
          followers: null,
          views: null,
          posts: null,
          likes: null,
          engagementRate: null,
          platformData: {
            name: stats.name,
            imageUrl: stats.imageUrl,
            url: stats.url,
          },
        });

        return reply.code(201).send({ data: account });
      } catch (err) {
        return reply.badRequest(err instanceof Error ? err.message : "Failed to connect Apple Music");
      }
    }

    // ── YouTube Music (reuses YouTube channel logic) ──
    if (platform === "youtube_music") {
      try {
        const channelId = extractYouTubeMusicChannelId(url);

        if (env.YOUTUBE_API_KEY) {
          const stats = await getChannelStats(channelId, env.YOUTUBE_API_KEY);
          const videos = await getPopularVideos(channelId, env.YOUTUBE_API_KEY, 5);

          const [account] = await app.db
            .insert(socialAccounts)
            .values({
              artistId: id,
              platform: "youtube_music",
              platformAccountId: channelId,
              username: stats.title,
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
              recentVideos: videos,
            },
          });

          return reply.code(201).send({ data: account });
        }

        // Fallback: public scraping
        const stats = await getChannelStatsPublic(`https://www.youtube.com/channel/${channelId}`);

        const [account] = await app.db
          .insert(socialAccounts)
          .values({
            artistId: id,
            platform: "youtube_music",
            platformAccountId: channelId,
            username: stats.title,
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
      } catch (err) {
        return reply.badRequest(err instanceof Error ? err.message : "Failed to connect YouTube Music");
      }
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
      const limit = Math.min(Number(request.query.limit) || 50, 1000);

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

  // GET /artists/:id/social-accounts/:accountId/history — Social Blade historical data
  app.get<{
    Params: { id: string; accountId: string };
  }>(
    "/artists/:id/social-accounts/:accountId/history",
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

      // Check cache
      const cacheKey = `${account.platform}:${account.platformAccountId}`;
      const cached = historyCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < HISTORY_CACHE_TTL) {
        return { data: cached.data };
      }

      const platform = account.platform as "youtube" | "instagram" | "tiktok";
      const history = await fetchHistory(
        platform,
        account.platformAccountId,
        app.env,
      );

      // Update cache even if empty (avoids hammering on errors)
      historyCache.set(cacheKey, { data: history, ts: Date.now() });

      return { data: history };
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

      // ── Spotify sync (embed + optional API) ──
      if (account.platform === "spotify") {
        const stats = await getSpotifyArtistStats(account.platformAccountId, env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET);
        const topTracks = await getSpotifyTopTracks(account.platformAccountId, 5);
        await app.db.insert(socialMetrics).values({
          socialAccountId: account.id,
          followers: stats.followers > 0 ? stats.followers : null,
          views: null,
          posts: null,
          likes: null,
          engagementRate: null,
          platformData: {
            name: stats.name,
            popularity: stats.popularity,
            genres: stats.genres,
            imageUrl: stats.imageUrl,
            topTracks,
          },
        });
      }

      // ── Deezer sync ──
      if (account.platform === "deezer") {
        const stats = await getDeezerArtistStats(account.platformAccountId);
        await app.db.insert(socialMetrics).values({
          socialAccountId: account.id,
          followers: stats.nbFan,
          views: null,
          posts: stats.nbAlbum,
          likes: null,
          engagementRate: null,
          platformData: {
            name: stats.name,
            pictureUrl: stats.pictureUrl,
          },
        });
      }

      // ── YouTube Music sync ──
      if (account.platform === "youtube_music") {
        if (env.YOUTUBE_API_KEY) {
          const stats = await getChannelStats(account.platformAccountId, env.YOUTUBE_API_KEY);
          const videos = await getPopularVideos(account.platformAccountId, env.YOUTUBE_API_KEY, 5);

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
              recentVideos: videos,
            },
          });
        }
      }

      syncCooldowns.set(accountId, Date.now());
      return { data: { synced: true } };
    }
  );
}
