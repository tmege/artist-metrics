const GRAPH_API_BASE = "https://graph.facebook.com/v19.0";

export interface InstagramProfile {
  igUserId: string;
  username: string;
  name: string;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  biography: string;
  profilePictureUrl: string;
}

export interface InstagramMedia {
  id: string;
  caption: string;
  mediaType: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
}

/**
 * Resolve an Instagram URL or handle to a username.
 * Works without OAuth — just extracts the username for linking.
 */
export function resolveInstagramUsername(input: string): string {
  const trimmed = input.trim();

  // Handle @username format
  if (trimmed.startsWith("@")) {
    return trimmed.slice(1).toLowerCase();
  }

  // Handle URL format
  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://instagram.com/${trimmed}`
    );
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]) {
      return parts[0].toLowerCase();
    }
  } catch {
    // Treat as plain username
  }

  return trimmed.toLowerCase().replace(/^@/, "");
}

/**
 * Get Instagram Business Account profile (requires OAuth token).
 */
export async function getProfile(
  accessToken: string,
  igUserId: string
): Promise<InstagramProfile> {
  const url = `${GRAPH_API_BASE}/${igUserId}?fields=username,name,followers_count,follows_count,media_count,biography,profile_picture_url&access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram API error: ${res.status}`);

  const data = await res.json();
  return {
    igUserId: data.id,
    username: data.username,
    name: data.name || "",
    followersCount: data.followers_count || 0,
    followsCount: data.follows_count || 0,
    mediaCount: data.media_count || 0,
    biography: data.biography || "",
    profilePictureUrl: data.profile_picture_url || "",
  };
}

/**
 * Get recent media with insights (requires OAuth).
 */
export async function getMediaInsights(
  accessToken: string,
  igUserId: string,
  limit = 25
): Promise<InstagramMedia[]> {
  const url = `${GRAPH_API_BASE}/${igUserId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count&limit=${limit}&access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram API error: ${res.status}`);

  const data = await res.json();
  return (data.data || []).map(
    (item: {
      id: string;
      caption?: string;
      media_type: string;
      timestamp: string;
      like_count?: number;
      comments_count?: number;
    }) => ({
      id: item.id,
      caption: item.caption || "",
      mediaType: item.media_type,
      timestamp: item.timestamp,
      likeCount: item.like_count || 0,
      commentsCount: item.comments_count || 0,
    })
  );
}

/**
 * Refresh a long-lived Instagram token (valid for 60 days).
 * Should be called when token has < 7 days remaining.
 */
export async function refreshLongLivedToken(
  currentToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `${GRAPH_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.INSTAGRAM_APP_ID}&client_secret=${process.env.INSTAGRAM_APP_SECRET}&fb_exchange_token=${currentToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Instagram token refresh error: ${res.status}`);

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}
