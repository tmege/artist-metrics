import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { socialAccounts, socialMetrics } from "../db/schema.js";
import { getChannelStats, getChannelStatsPublic, getRecentVideos } from "../services/youtube.js";
import {
  getProfile as getInstagramProfile,
  getMediaInsights,
  refreshLongLivedToken as refreshInstagramToken,
} from "../services/instagram.js";
import {
  getUserInfo as getTikTokUserInfo,
  getUserVideos as getTikTokUserVideos,
  refreshAccessToken as refreshTikTokToken,
} from "../services/tiktok.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import type { Env } from "../config/env.js";
import type { FastifyBaseLogger } from "fastify";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function startSyncJob(db: Database, env: Env, log: FastifyBaseLogger) {
  async function syncAll() {
    log.info("Starting periodic metrics sync");

    const accounts = await db.select().from(socialAccounts);

    for (const account of accounts) {
      try {
        await syncAccount(db, env, account, log);
      } catch (err) {
        log.error(
          { accountId: account.id, platform: account.platform, err },
          "Failed to sync account"
        );
      }
    }

    log.info(`Metrics sync complete — ${accounts.length} accounts processed`);
  }

  // Run immediately, then every 6 hours
  syncAll();
  const interval = setInterval(syncAll, SIX_HOURS_MS);

  return () => clearInterval(interval);
}

async function syncAccount(
  db: Database,
  env: Env,
  account: typeof socialAccounts.$inferSelect,
  log: FastifyBaseLogger
) {
  // ── YouTube ──
  if (account.platform === "youtube") {
    if (env.YOUTUBE_API_KEY) {
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

      await db.insert(socialMetrics).values({
        socialAccountId: account.id,
        followers: stats.subscriberCount,
        views: stats.viewCount,
        posts: stats.videoCount,
        likes: totalLikes,
        engagementRate: null,
        platformData: {
          title: stats.title,
          thumbnailUrl: stats.thumbnailUrl,
          recentVideos: videos.slice(0, 3),
        },
      });
    } else {
      // Fallback: scrape public page
      const stats = await getChannelStatsPublic(account.platformAccountId);
      await db.insert(socialMetrics).values({
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
    }
    return;
  }

  // ── Instagram (OAuth required) ──
  if (
    account.platform === "instagram" &&
    account.isOAuthConnected &&
    account.accessToken
  ) {
    let accessToken = decrypt(account.accessToken, env.TOKEN_ENCRYPTION_KEY);

    // Refresh if < 7 days remaining
    if (
      account.tokenExpiresAt &&
      account.tokenExpiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    ) {
      try {
        const refreshed = await refreshInstagramToken(accessToken);
        accessToken = refreshed.accessToken;
        const encryptedToken = encrypt(accessToken, env.TOKEN_ENCRYPTION_KEY);
        await db
          .update(socialAccounts)
          .set({
            accessToken: encryptedToken,
            tokenExpiresAt: new Date(
              Date.now() + refreshed.expiresIn * 1000
            ),
            updatedAt: new Date(),
          })
          .where(eq(socialAccounts.id, account.id));
      } catch (err) {
        log.error({ accountId: account.id, err }, "Instagram token refresh failed");
      }
    }

    const profile = await getInstagramProfile(
      accessToken,
      account.platformAccountId
    );
    const media = await getMediaInsights(
      accessToken,
      account.platformAccountId,
      25
    );

    const totalLikes = media.reduce((sum, m) => sum + m.likeCount, 0);
    const totalComments = media.reduce((sum, m) => sum + m.commentsCount, 0);
    const engagementRate =
      profile.followersCount > 0
        ? ((totalLikes + totalComments) / media.length / profile.followersCount) * 100
        : null;

    await db.insert(socialMetrics).values({
      socialAccountId: account.id,
      followers: profile.followersCount,
      views: null,
      posts: profile.mediaCount,
      likes: totalLikes,
      engagementRate,
      platformData: {
        username: profile.username,
        name: profile.name,
        recentMedia: media.slice(0, 5),
      },
    });
    return;
  }

  // ── TikTok (OAuth required) ──
  if (
    account.platform === "tiktok" &&
    account.isOAuthConnected &&
    account.accessToken
  ) {
    let accessToken = decrypt(account.accessToken, env.TOKEN_ENCRYPTION_KEY);

    // Refresh if < 1 hour remaining
    if (
      account.tokenExpiresAt &&
      account.tokenExpiresAt.getTime() - Date.now() < 60 * 60 * 1000 &&
      account.refreshToken &&
      env.TIKTOK_CLIENT_KEY &&
      env.TIKTOK_CLIENT_SECRET
    ) {
      try {
        const refreshToken = decrypt(
          account.refreshToken,
          env.TOKEN_ENCRYPTION_KEY
        );
        const refreshed = await refreshTikTokToken(
          refreshToken,
          env.TIKTOK_CLIENT_KEY,
          env.TIKTOK_CLIENT_SECRET
        );
        accessToken = refreshed.accessToken;

        await db
          .update(socialAccounts)
          .set({
            accessToken: encrypt(accessToken, env.TOKEN_ENCRYPTION_KEY),
            refreshToken: encrypt(
              refreshed.refreshToken,
              env.TOKEN_ENCRYPTION_KEY
            ),
            tokenExpiresAt: new Date(
              Date.now() + refreshed.expiresIn * 1000
            ),
            updatedAt: new Date(),
          })
          .where(eq(socialAccounts.id, account.id));
      } catch (err) {
        log.error({ accountId: account.id, err }, "TikTok token refresh failed");
      }
    }

    const userInfo = await getTikTokUserInfo(accessToken);
    const videos = await getTikTokUserVideos(accessToken, 20);

    const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);

    await db.insert(socialMetrics).values({
      socialAccountId: account.id,
      followers: userInfo.followerCount,
      views: totalViews,
      posts: userInfo.videoCount,
      likes: userInfo.likesCount,
      engagementRate: null,
      platformData: {
        displayName: userInfo.displayName,
        avatarUrl: userInfo.avatarUrl,
        recentVideos: videos.slice(0, 5),
      },
    });
  }
}
