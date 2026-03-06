import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { socialAccounts, socialMetrics } from "../db/schema.js";
import { encrypt } from "../lib/crypto.js";
import { getProfile as getInstagramProfile } from "../services/instagram.js";
import { getUserInfo as getTikTokUserInfo } from "../services/tiktok.js";

export async function oauthRoutes(app: FastifyInstance) {
  const env = app.env;

  // ── Instagram OAuth ──

  // GET /oauth/instagram/authorize — redirect to Facebook OAuth
  app.get<{ Querystring: { accountId: string } }>(
    "/oauth/instagram/authorize",
    async (request, reply) => {
      if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_APP_SECRET) {
        return reply.badRequest("Instagram OAuth not configured");
      }

      const { accountId } = request.query;
      if (!accountId) return reply.badRequest("accountId is required");

      const apiBase = env.API_URL || `http://localhost:${env.PORT}`;
      const redirectUri = `${apiBase}/oauth/instagram/callback`;
      const state = Buffer.from(
        JSON.stringify({ accountId })
      ).toString("base64url");

      const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
      authUrl.searchParams.set("client_id", env.INSTAGRAM_APP_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set(
        "scope",
        "business_management,instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement"
      );
      authUrl.searchParams.set("response_type", "code");

      return reply.redirect(authUrl.toString());
    }
  );

  // GET /oauth/instagram/callback — exchange code for tokens
  app.get<{ Querystring: { code: string; state: string } }>(
    "/oauth/instagram/callback",
    async (request, reply) => {
      if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_APP_SECRET) {
        return reply.badRequest("Instagram OAuth not configured");
      }

      const { code, state } = request.query;
      let accountId: string;

      try {
        const decoded = JSON.parse(
          Buffer.from(state, "base64url").toString()
        );
        accountId = decoded.accountId;
      } catch {
        return reply.badRequest("Invalid state parameter");
      }

      const apiBase = env.API_URL || `http://localhost:${env.PORT}`;
      const redirectUri = `${apiBase}/oauth/instagram/callback`;

      // Exchange code for short-lived token
      const tokenRes = await fetch(
        "https://graph.facebook.com/v19.0/oauth/access_token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: env.INSTAGRAM_APP_ID,
            client_secret: env.INSTAGRAM_APP_SECRET,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
            code,
          }),
        }
      );

      if (!tokenRes.ok) {
        app.log.error("Instagram token exchange failed");
        return reply.redirect(
          `${env.FRONTEND_URL}/dashboard?error=instagram_auth_failed`
        );
      }

      const tokenData = await tokenRes.json();

      // Exchange for long-lived token (60 days)
      const longLivedRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.INSTAGRAM_APP_ID}&client_secret=${env.INSTAGRAM_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
      );

      const longLivedData = await longLivedRes.json();
      const accessToken = longLivedData.access_token || tokenData.access_token;
      const expiresIn = longLivedData.expires_in || 5184000; // 60 days default

      // Discover Instagram Business Account ID
      const pagesRes = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
      );
      const pagesData = await pagesRes.json();
      const page = pagesData.data?.[0];

      if (!page) {
        return reply.redirect(
          `${env.FRONTEND_URL}/dashboard?error=no_facebook_page`
        );
      }

      const igRes = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`
      );
      const igData = await igRes.json();
      const igUserId = igData.instagram_business_account?.id;

      if (!igUserId) {
        return reply.redirect(
          `${env.FRONTEND_URL}/dashboard?error=no_instagram_business`
        );
      }

      // Update the social account with OAuth tokens
      const encryptedToken = encrypt(accessToken, env.TOKEN_ENCRYPTION_KEY);
      const tokenExpiresAt = new Date(
        Date.now() + expiresIn * 1000
      );

      await app.db
        .update(socialAccounts)
        .set({
          platformAccountId: igUserId,
          isOAuthConnected: true,
          accessToken: encryptedToken,
          tokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, accountId));

      // Fetch initial metrics
      try {
        const profile = await getInstagramProfile(accessToken, igUserId);
        await app.db.insert(socialMetrics).values({
          socialAccountId: accountId,
          followers: profile.followersCount,
          views: null,
          posts: profile.mediaCount,
          likes: null,
          engagementRate: null,
          platformData: {
            username: profile.username,
            name: profile.name,
            biography: profile.biography,
            profilePictureUrl: profile.profilePictureUrl,
          },
        });
      } catch (err) {
        app.log.error(err, "Failed to fetch initial Instagram metrics");
      }

      return reply.redirect(`${env.FRONTEND_URL}/dashboard?instagram=connected`);
    }
  );

  // ── TikTok OAuth ──

  // GET /oauth/tiktok/authorize — redirect to TikTok auth
  app.get<{ Querystring: { accountId: string } }>(
    "/oauth/tiktok/authorize",
    async (request, reply) => {
      if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
        return reply.badRequest("TikTok OAuth not configured");
      }

      const { accountId } = request.query;
      if (!accountId) return reply.badRequest("accountId is required");

      const apiBase = env.API_URL || `http://localhost:${env.PORT}`;
      const redirectUri = `${apiBase}/oauth/tiktok/callback`;
      const state = Buffer.from(
        JSON.stringify({ accountId })
      ).toString("base64url");

      const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
      authUrl.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set(
        "scope",
        "user.info.basic,user.info.stats,video.list"
      );
      authUrl.searchParams.set("response_type", "code");

      return reply.redirect(authUrl.toString());
    }
  );

  // GET /oauth/tiktok/callback — exchange code for tokens
  app.get<{ Querystring: { code: string; state: string } }>(
    "/oauth/tiktok/callback",
    async (request, reply) => {
      if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
        return reply.badRequest("TikTok OAuth not configured");
      }

      const { code, state } = request.query;
      let accountId: string;

      try {
        const decoded = JSON.parse(
          Buffer.from(state, "base64url").toString()
        );
        accountId = decoded.accountId;
      } catch {
        return reply.badRequest("Invalid state parameter");
      }

      const apiBase = env.API_URL || `http://localhost:${env.PORT}`;
      const redirectUri = `${apiBase}/oauth/tiktok/callback`;

      // Exchange code for tokens
      const tokenRes = await fetch(
        "https://open.tiktokapis.com/v2/oauth/token/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_key: env.TIKTOK_CLIENT_KEY,
            client_secret: env.TIKTOK_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }),
        }
      );

      if (!tokenRes.ok) {
        app.log.error("TikTok token exchange failed");
        return reply.redirect(
          `${env.FRONTEND_URL}/dashboard?error=tiktok_auth_failed`
        );
      }

      const tokenData = await tokenRes.json();
      const { access_token, refresh_token, expires_in } = tokenData;

      // Store encrypted tokens
      const encryptedAccess = encrypt(access_token, env.TOKEN_ENCRYPTION_KEY);
      const encryptedRefresh = refresh_token
        ? encrypt(refresh_token, env.TOKEN_ENCRYPTION_KEY)
        : null;
      const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

      await app.db
        .update(socialAccounts)
        .set({
          isOAuthConnected: true,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, accountId));

      // Fetch initial metrics
      try {
        const userInfo = await getTikTokUserInfo(access_token);
        await app.db
          .update(socialAccounts)
          .set({
            platformAccountId: userInfo.openId,
            username: userInfo.displayName,
          })
          .where(eq(socialAccounts.id, accountId));

        await app.db.insert(socialMetrics).values({
          socialAccountId: accountId,
          followers: userInfo.followerCount,
          views: null,
          posts: userInfo.videoCount,
          likes: userInfo.likesCount,
          engagementRate: null,
          platformData: {
            displayName: userInfo.displayName,
            avatarUrl: userInfo.avatarUrl,
          },
        });
      } catch (err) {
        app.log.error(err, "Failed to fetch initial TikTok metrics");
      }

      return reply.redirect(`${env.FRONTEND_URL}/dashboard?tiktok=connected`);
    }
  );
}
