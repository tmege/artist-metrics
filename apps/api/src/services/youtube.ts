const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubeChannelStats {
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  customUrl: string | null;
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

/**
 * Extract a YouTube handle or channel identifier from various URL formats.
 */
function extractHandle(input: string): string {
  const trimmed = input.trim();

  // Direct channel ID
  if (trimmed.startsWith("UC") && trimmed.length === 24) {
    return trimmed;
  }

  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://youtube.com/${trimmed}`
    );
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "channel" && parts[1]) return parts[1];
    if (parts[0]?.startsWith("@")) return parts[0];
    if (parts[0] === "c" && parts[1]) return `@${parts[1]}`;
    if (parts[0]) return `@${parts[0]}`;
  } catch {
    // Plain handle
  }

  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

// ── Public approach (no API key) ──

/**
 * Resolve a YouTube URL/handle and fetch basic stats by scraping the public page.
 * Works without any API key.
 */
export async function getChannelStatsPublic(
  input: string
): Promise<YouTubeChannelStats> {
  const handle = extractHandle(input);
  const pageUrl = handle.startsWith("UC")
    ? `https://www.youtube.com/channel/${handle}`
    : `https://www.youtube.com/${handle}`;

  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) {
    throw new Error(`YouTube page not accessible (${res.status})`);
  }

  const html = await res.text();

  // Extract channel name
  const titleMatch = html.match(/"channelMetadataRenderer":\{"title":"([^"]+)"/);
  const title = titleMatch?.[1] || handle.replace("@", "");

  // Extract subscriber count (may be hidden for small channels)
  const subMatch = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/);
  const subscriberText = subMatch?.[1] || "0";
  const subscriberCount = parseYouTubeCount(subscriberText);

  // Extract channel ID
  const cidMatch = html.match(/"channelId":"(UC[^"]+)"/);
  const channelId = cidMatch?.[1] || handle;

  // Extract avatar
  const avatarMatch = html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
  const thumbnailUrl = avatarMatch?.[1] || "";

  // Extract vanity URL
  const vanityMatch = html.match(/"vanityChannelUrl":"https:\/\/www\.youtube\.com\/([^"]+)"/);
  const customUrl = vanityMatch?.[1] || null;

  // Extract description
  const descMatch = html.match(/"description":"((?:[^"\\]|\\.)*)"/);
  const description = descMatch?.[1]?.replace(/\\n/g, "\n") || "";

  // Extract all individual video view counts and sum them for total views
  const videoViewMatches = html.matchAll(/"viewCountText":\{"simpleText":"([\d,]+) views?"\}/g);
  const videoViews = [...videoViewMatches].map((m) =>
    parseInt(m[1].replace(/,/g, ""), 10)
  );
  // Deduplicate (YouTube repeats entries) — take unique set by using first half
  const uniqueViews = videoViews.slice(0, Math.ceil(videoViews.length / 2));
  const viewCount = uniqueViews.reduce((sum, v) => sum + v, 0);
  const videoCount = uniqueViews.length;

  // Try explicit video count from the page
  const videoCountMatch = html.match(/"videosCountText":\{"runs":\[\{"text":"([\d,]+)"/);
  const explicitVideoCount = videoCountMatch
    ? parseInt(videoCountMatch[1].replace(/,/g, ""), 10)
    : videoCount;

  return {
    channelId,
    title,
    description,
    thumbnailUrl,
    subscriberCount,
    viewCount,
    videoCount: explicitVideoCount,
    customUrl,
  };
}

/**
 * Parse YouTube formatted count strings like "1.2M subscribers", "345K", "1,234"
 */
function parseYouTubeCount(text: string): number {
  const cleaned = text.replace(/[^0-9.KMBkmb]/g, "").trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  const upper = cleaned.toUpperCase();
  if (upper.endsWith("B")) return Math.round(num * 1_000_000_000);
  if (upper.endsWith("M")) return Math.round(num * 1_000_000);
  if (upper.endsWith("K")) return Math.round(num * 1_000);
  return Math.round(num);
}

// ── API key approach (richer data) ──

/**
 * Resolve a YouTube URL/handle to a channel ID using the API.
 */
export async function resolveChannelId(
  input: string,
  apiKey: string
): Promise<string> {
  const handle = extractHandle(input);

  if (handle.startsWith("UC") && handle.length === 24) {
    return handle;
  }

  const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=1&key=${apiKey}`;
  const res = await fetch(searchUrl);
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = await res.json();
  if (data.items?.[0]?.snippet?.channelId) {
    return data.items[0].snippet.channelId;
  }

  throw new Error("Could not resolve YouTube channel from the provided input");
}

/**
 * Get channel statistics using YouTube Data API v3 (requires API key).
 */
export async function getChannelStats(
  channelId: string,
  apiKey: string
): Promise<YouTubeChannelStats> {
  const url = `${YOUTUBE_API_BASE}/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);

  const data = await res.json();
  const channel = data.items?.[0];
  if (!channel) throw new Error("Channel not found");

  return {
    channelId: channel.id,
    title: channel.snippet.title,
    description: channel.snippet.description,
    thumbnailUrl: channel.snippet.thumbnails?.default?.url || "",
    customUrl: channel.snippet.customUrl || null,
    subscriberCount: Number(channel.statistics.subscriberCount) || 0,
    viewCount: Number(channel.statistics.viewCount) || 0,
    videoCount: Number(channel.statistics.videoCount) || 0,
  };
}

/**
 * Get recent videos from a channel (requires API key).
 */
export async function getRecentVideos(
  channelId: string,
  apiKey: string,
  maxResults = 10
): Promise<YouTubeVideo[]> {
  const channelUrl = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
  const channelRes = await fetch(channelUrl);
  if (!channelRes.ok) throw new Error(`YouTube API error: ${channelRes.status}`);

  const channelData = await channelRes.json();
  const uploadsPlaylistId =
    channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return [];

  const playlistUrl = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`;
  const playlistRes = await fetch(playlistUrl);
  if (!playlistRes.ok) throw new Error(`YouTube API error: ${playlistRes.status}`);

  const playlistData = await playlistRes.json();
  const videoIds = playlistData.items
    ?.map((item: { snippet?: { resourceId?: { videoId?: string } } }) => item.snippet?.resourceId?.videoId)
    .filter(Boolean)
    .join(",");

  if (!videoIds) return [];

  const videosUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`;
  const videosRes = await fetch(videosUrl);
  if (!videosRes.ok) throw new Error(`YouTube API error: ${videosRes.status}`);

  const videosData = await videosRes.json();
  return (videosData.items || []).map(
    (v: {
      id: string;
      snippet: { title: string; publishedAt: string; thumbnails?: { default?: { url?: string } } };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
    }) => ({
      videoId: v.id,
      title: v.snippet.title,
      publishedAt: v.snippet.publishedAt,
      thumbnailUrl: v.snippet.thumbnails?.default?.url || "",
      viewCount: Number(v.statistics.viewCount) || 0,
      likeCount: Number(v.statistics.likeCount) || 0,
      commentCount: Number(v.statistics.commentCount) || 0,
    })
  );
}
