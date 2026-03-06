import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../config/env.js";

export interface HistoryRow {
  date: string;
  followers: number | null;
  views: number | null;
  posts: number | null;
}

type Platform = "youtube" | "instagram" | "tiktok";

const SB_PLATFORM_MAP: Record<Platform, string> = {
  youtube: "youtube",
  instagram: "instagram",
  tiktok: "tiktok",
};

/**
 * Fetch historical metrics from Social Blade.
 * Tries the official API first (if keys are configured), then falls back
 * to the free `socialblade-com-api` scraping package (~30 days).
 */
export async function fetchHistory(
  platform: Platform,
  identifier: string,
  env: Env,
  log?: FastifyBaseLogger,
): Promise<HistoryRow[]> {
  // Try official API first
  if (env.SOCIALBLADE_CLIENT_ID && env.SOCIALBLADE_TOKEN) {
    try {
      return await fetchFromOfficialAPI(platform, identifier, env);
    } catch (err) {
      log?.warn(err, "[socialblade] Official API failed, trying scraping fallback");
    }
  }

  // Fallback: free scraping package
  try {
    return await fetchFromScraping(platform, identifier);
  } catch (err) {
    log?.warn(err, "[socialblade] Scraping fallback failed");
    return [];
  }
}

async function fetchFromOfficialAPI(
  platform: Platform,
  identifier: string,
  env: Env,
): Promise<HistoryRow[]> {
  const sbPlatform = SB_PLATFORM_MAP[platform];
  const url = `https://matrix.sbapis.com/b/${sbPlatform}/statistics?query=${encodeURIComponent(identifier)}`;

  const res = await fetch(url, {
    headers: {
      clientid: env.SOCIALBLADE_CLIENT_ID!,
      token: env.SOCIALBLADE_TOKEN!,
    },
  });

  if (!res.ok) {
    throw new Error(`Social Blade API ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as {
    data?: {
      daily?: Array<{
        date: string;
        subscribers?: number;
        followers?: number;
        views?: number;
        uploads?: number;
        posts?: number;
      }>;
    };
  };

  const daily = json.data?.daily;
  if (!Array.isArray(daily)) return [];

  return daily.map((d) => ({
    date: d.date,
    followers: d.subscribers ?? d.followers ?? null,
    views: d.views ?? null,
    posts: d.uploads ?? d.posts ?? null,
  }));
}

async function fetchFromScraping(
  platform: Platform,
  identifier: string,
): Promise<HistoryRow[]> {
  const { socialblade } = await import("socialblade-com-api");

  const sbSource = SB_PLATFORM_MAP[platform];
  const result = await socialblade(sbSource, identifier);

  if (!result?.table || !Array.isArray(result.table)) return [];

  return result.table.map((row: {
    date: string;
    followers?: number;
    following?: number;
    posts?: number;
  }) => ({
    date: row.date,
    followers: row.followers ?? null,
    views: null, // scraping doesn't provide views for most platforms
    posts: row.posts ?? null,
  }));
}
