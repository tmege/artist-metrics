/**
 * Streaming platform services: Spotify, Deezer, Apple Music, YouTube Music.
 * Each provides functions to extract artist IDs from URLs and fetch stats.
 */

// ─── URL ID Extractors ───

export function extractSpotifyArtistId(input: string): string {
  const match = input.match(/artist\/([a-zA-Z0-9]+)/);
  if (match) return match[1];
  // If it's just an ID
  if (/^[a-zA-Z0-9]{22}$/.test(input.trim())) return input.trim();
  throw new Error("Could not extract Spotify artist ID from URL");
}

export function extractDeezerArtistId(input: string): string {
  const match = input.match(/artist\/(\d+)/);
  if (match) return match[1];
  if (/^\d+$/.test(input.trim())) return input.trim();
  throw new Error("Could not extract Deezer artist ID from URL");
}

export function extractAppleMusicArtistId(input: string): string {
  const match = input.match(/artist\/[^/]*\/(\d+)/);
  if (match) return match[1];
  // Try without name segment: /artist/1236267297
  const match2 = input.match(/artist\/(\d+)/);
  if (match2) return match2[1];
  if (/^\d+$/.test(input.trim())) return input.trim();
  throw new Error("Could not extract Apple Music artist ID from URL");
}

export function extractYouTubeMusicChannelId(input: string): string {
  const match = input.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (input.trim().startsWith("UC") && input.trim().length === 24) return input.trim();
  throw new Error("Could not extract YouTube Music channel ID from URL");
}

// ─── Spotify (public embed scraping — no API key needed) ───

export interface SpotifyArtistStats {
  artistId: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string[];
  imageUrl: string | null;
}

export interface SpotifyTopTrack {
  trackId: string;
  name: string;
  albumName: string;
  albumImageUrl: string | null;
  popularity: number;
}

interface SpotifyEmbedData {
  name: string;
  imageUrl: string | null;
  topTracks: SpotifyTopTrack[];
}

async function scrapeSpotifyEmbed(artistId: string): Promise<SpotifyEmbedData> {
  const res = await fetch(`https://open.spotify.com/embed/artist/${artistId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) throw new Error(`Spotify embed page error: ${res.status}`);
  const html = await res.text();

  const jsonMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (!jsonMatch) throw new Error("Could not parse Spotify embed data");

  const nextData = JSON.parse(jsonMatch[1]);
  const entity = nextData?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error("Could not find artist data in Spotify embed");

  // Extract image from visualIdentity
  const images = entity.visualIdentity?.image;
  const imageUrl = Array.isArray(images) && images.length > 0
    ? images[0]?.url ?? null
    : null;

  // Extract top tracks
  const trackList = entity.trackList || [];
  const topTracks: SpotifyTopTrack[] = trackList.slice(0, 5).map((t: {
    uri: string;
    title: string;
    subtitle: string;
  }, i: number) => {
    const trackId = t.uri?.replace("spotify:track:", "") || "";
    return {
      trackId,
      name: t.title,
      albumName: t.subtitle || "",
      albumImageUrl: null,
      popularity: 100 - i, // embed doesn't expose popularity, use order as proxy
    };
  });

  return {
    name: entity.name || `Artist ${artistId}`,
    imageUrl,
    topTracks,
  };
}

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };

  spotifyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function trySpotifyApi(
  artistId: string,
  clientId?: string,
  clientSecret?: string,
): Promise<{ followers: number; popularity: number; genres: string[] } | null> {
  if (!clientId || !clientSecret) return null;
  try {
    const token = await getSpotifyAccessToken(clientId, clientSecret);
    const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      followers: { total: number };
      popularity: number;
      genres: string[];
    };
    return {
      followers: data.followers.total,
      popularity: data.popularity,
      genres: data.genres,
    };
  } catch {
    return null;
  }
}

/**
 * Get Spotify artist stats. Combines embed scraping (always works) with
 * official API (followers, popularity, genres) when credentials are available.
 */
export async function getSpotifyArtistStats(
  artistId: string,
  clientId?: string,
  clientSecret?: string,
): Promise<SpotifyArtistStats> {
  const [embed, apiData] = await Promise.all([
    scrapeSpotifyEmbed(artistId),
    trySpotifyApi(artistId, clientId, clientSecret),
  ]);

  return {
    artistId,
    name: embed.name,
    followers: apiData?.followers ?? 0,
    popularity: apiData?.popularity ?? 0,
    genres: apiData?.genres ?? [],
    imageUrl: embed.imageUrl,
  };
}

export async function getSpotifyTopTracks(
  artistId: string,
  limit = 5,
): Promise<SpotifyTopTrack[]> {
  const embed = await scrapeSpotifyEmbed(artistId);
  return embed.topTracks.slice(0, limit);
}

// ─── Deezer (free, no auth) ───

export interface DeezerArtistStats {
  artistId: string;
  name: string;
  nbFan: number;
  nbAlbum: number;
  pictureUrl: string | null;
}

export async function getDeezerArtistStats(
  artistId: string,
): Promise<DeezerArtistStats> {
  const res = await fetch(`https://api.deezer.com/artist/${artistId}`);
  if (!res.ok) throw new Error(`Deezer API error: ${res.status}`);

  const data = (await res.json()) as {
    id: number;
    name: string;
    nb_fan: number;
    nb_album: number;
    picture_medium: string;
    error?: { type: string; message: string };
  };

  if (data.error) throw new Error(`Deezer: ${data.error.message}`);

  return {
    artistId: data.id.toString(),
    name: data.name,
    nbFan: data.nb_fan,
    nbAlbum: data.nb_album,
    pictureUrl: data.picture_medium ?? null,
  };
}

// ─── Apple Music (scrape public page) ───

export interface AppleMusicArtistStats {
  artistId: string;
  name: string;
  imageUrl: string | null;
  url: string;
}

export async function getAppleMusicArtistStats(
  artistId: string,
): Promise<AppleMusicArtistStats> {
  const pageUrl = `https://music.apple.com/us/artist/${artistId}`;
  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`Apple Music page error: ${res.status}`);
  const html = await res.text();

  const nameMatch =
    html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/) ??
    html.match(/<title>(?:\u200e)?([^<]+)/);
  const name = nameMatch?.[1]
    ?.replace(/ on Apple Music$/, "")
    .replace(/ - Apple Music$/, "")
    .trim() || `Artist ${artistId}`;

  const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  const imageUrl = imageMatch?.[1] ?? null;

  return {
    artistId,
    name,
    imageUrl,
    url: pageUrl,
  };
}

// ─── YouTube Music (reuses YouTube channel ID) ───
// YouTube Music uses the same channel IDs as YouTube.
// We reuse getChannelStats / getChannelStatsPublic from the youtube service.
