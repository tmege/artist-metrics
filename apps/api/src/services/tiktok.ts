const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

export interface TikTokUserInfo {
  openId: string;
  displayName: string;
  avatarUrl: string;
  followerCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
}

export interface TikTokVideo {
  id: string;
  title: string;
  createTime: number;
  coverImageUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
}

/**
 * Resolve a TikTok URL or handle to a username.
 * Works without OAuth — just extracts the username for linking.
 */
export function resolveTikTokUsername(input: string): string {
  const trimmed = input.trim();

  // Handle @username format
  if (trimmed.startsWith("@")) {
    return trimmed.slice(1).toLowerCase();
  }

  // Handle URL format
  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://tiktok.com/@${trimmed}`
    );
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) {
      return parts[0].slice(1).toLowerCase();
    }
    if (parts[0]) {
      return parts[0].toLowerCase();
    }
  } catch {
    // Treat as plain username
  }

  return trimmed.toLowerCase().replace(/^@/, "");
}

/**
 * Get TikTok user info (requires OAuth token).
 */
export async function getUserInfo(
  accessToken: string
): Promise<TikTokUserInfo> {
  const res = await fetch(`${TIKTOK_API_BASE}/user/info/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: [
        "open_id",
        "display_name",
        "avatar_url",
        "follower_count",
        "following_count",
        "likes_count",
        "video_count",
      ],
    }),
  });

  if (!res.ok) throw new Error(`TikTok API error: ${res.status}`);

  const data = await res.json();
  const user = data.data?.user;
  if (!user) throw new Error("TikTok user not found");

  return {
    openId: user.open_id,
    displayName: user.display_name || "",
    avatarUrl: user.avatar_url || "",
    followerCount: user.follower_count || 0,
    followingCount: user.following_count || 0,
    likesCount: user.likes_count || 0,
    videoCount: user.video_count || 0,
  };
}

/**
 * Get user's recent videos (requires OAuth token).
 */
export async function getUserVideos(
  accessToken: string,
  maxCount = 20
): Promise<TikTokVideo[]> {
  const res = await fetch(`${TIKTOK_API_BASE}/video/list/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      max_count: maxCount,
      fields: [
        "id",
        "title",
        "create_time",
        "cover_image_url",
        "view_count",
        "like_count",
        "comment_count",
        "share_count",
      ],
    }),
  });

  if (!res.ok) throw new Error(`TikTok API error: ${res.status}`);

  const data = await res.json();
  return (data.data?.videos || []).map(
    (v: {
      id: string;
      title?: string;
      create_time: number;
      cover_image_url?: string;
      view_count?: number;
      like_count?: number;
      comment_count?: number;
      share_count?: number;
    }) => ({
      id: v.id,
      title: v.title || "",
      createTime: v.create_time,
      coverImageUrl: v.cover_image_url || "",
      viewCount: v.view_count || 0,
      likeCount: v.like_count || 0,
      commentCount: v.comment_count || 0,
      shareCount: v.share_count || 0,
    })
  );
}

/**
 * Refresh TikTok access token using refresh token.
 * Access token: 24h, Refresh token: 365 days.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientKey: string,
  clientSecret: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}> {
  const res = await fetch(`${TIKTOK_API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`TikTok token refresh error: ${res.status}`);

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_expires_in,
  };
}
