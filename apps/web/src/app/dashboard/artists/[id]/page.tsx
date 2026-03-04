"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import {
  Music,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useArtists } from "@/contexts/artists-context";

interface SocialMetrics {
  followers: number | null;
  views: number | null;
  posts: number | null;
  likes: number | null;
  engagementRate: number | null;
  fetchedAt: string;
}

interface SocialAccount {
  id: string;
  platform: "youtube" | "instagram" | "tiktok";
  platformAccountId: string;
  username: string | null;
  isOAuthConnected: boolean;
  latestMetrics: SocialMetrics | null;
}

interface ArtistDetail {
  id: string;
  name: string;
  imageUrl: string | null;
  socialAccounts: SocialAccount[];
}

const PLATFORMS = ["youtube", "instagram", "tiktok"] as const;
type Platform = (typeof PLATFORMS)[number];

const platformConfig: Record<Platform, { label: string; color: string; bg: string; border: string; placeholder: string }> = {
  youtube: {
    label: "YouTube",
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    placeholder: "https://youtube.com/@handle or channel URL",
  },
  instagram: {
    label: "Instagram",
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    border: "border-pink-500/30",
    placeholder: "https://instagram.com/username or @username",
  },
  tiktok: {
    label: "TikTok",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/30",
    placeholder: "https://tiktok.com/@username or @username",
  },
};

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function ArtistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { refreshArtists } = useArtists();
  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [connectUrls, setConnectUrls] = useState<Record<Platform, string>>({
    youtube: "",
    instagram: "",
    tiktok: "",
  });
  const [connectErrors, setConnectErrors] = useState<Record<string, string | null>>({});

  const artistId = params.id as string;

  function fetchArtist() {
    apiFetch<{ data: ArtistDetail }>(`/artists/${artistId}`)
      .then((res) => setArtist(res.data))
      .catch(() => router.push("/dashboard/artists"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchArtist();
  }, [artistId]);

  async function handleSync(accountId: string) {
    setSyncing(accountId);
    try {
      await apiFetch(`/artists/${artistId}/social-accounts/${accountId}/sync`, {
        method: "POST",
      });
      fetchArtist();
    } catch {
      // Ignore rate limit errors silently
    } finally {
      setSyncing(null);
    }
  }

  async function handleDisconnect(accountId: string) {
    try {
      await apiFetch(`/artists/${artistId}/social-accounts/${accountId}`, {
        method: "DELETE",
      });
      fetchArtist();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to disconnect");
    }
  }

  async function handleConnect(platform: Platform) {
    const url = connectUrls[platform].trim();
    if (!url) return;

    setConnectingPlatform(platform);
    setConnectErrors((prev) => ({ ...prev, [platform]: null }));

    try {
      await apiFetch(`/artists/${artistId}/social-accounts`, {
        method: "POST",
        body: JSON.stringify({ platform, url }),
      });
      setConnectUrls((prev) => ({ ...prev, [platform]: "" }));
      fetchArtist();
    } catch (err) {
      setConnectErrors((prev) => ({
        ...prev,
        [platform]: err instanceof Error ? err.message : "Failed to connect",
      }));
    } finally {
      setConnectingPlatform(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading artist...</p>
      </div>
    );
  }

  if (!artist) return null;

  const accountByPlatform = Object.fromEntries(
    artist.socialAccounts.map((a) => [a.platform, a])
  ) as Partial<Record<Platform, SocialAccount>>;

  return (
    <div className="space-y-6">
      {/* Artist Header */}
      <div className="flex items-center gap-4">
        {artist.imageUrl ? (
          <img
            src={artist.imageUrl}
            alt={artist.name}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <Music className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div>
          <h3 className="text-2xl font-bold">{artist.name}</h3>
          <p className="text-sm text-muted-foreground">
            {artist.socialAccounts.length} connected account
            {artist.socialAccounts.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* 3 Platform Cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const cfg = platformConfig[platform];
          const account = accountByPlatform[platform];
          const m = account?.latestMetrics;

          return (
            <div
              key={platform}
              className={`rounded-lg border bg-card p-6 ${account ? "border-border" : cfg.border + " border-dashed"}`}
            >
              {/* Platform header */}
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${cfg.color} ${cfg.bg}`}
                >
                  {cfg.label}
                </span>
                {account && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSync(account.id)}
                      disabled={syncing === account.id}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
                      title="Sync metrics"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${syncing === account.id ? "animate-spin" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(account.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      title="Disconnect"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {account ? (
                <>
                  <p className="mt-2 text-sm font-medium">
                    {account.username || account.platformAccountId}
                  </p>
                  {account.isOAuthConnected && (
                    <span className="text-xs text-emerald-500">OAuth connected</span>
                  )}

                  {m ? (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Followers</p>
                          <p className="text-lg font-semibold">{formatNumber(m.followers)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Views</p>
                          <p className="text-lg font-semibold">{formatNumber(m.views)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Likes</p>
                          <p className="text-lg font-semibold">{formatNumber(m.likes)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Posts</p>
                          <p className="text-lg font-semibold">{formatNumber(m.posts)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Last synced: {new Date(m.fetchedAt).toLocaleString()}
                      </p>
                    </>
                  ) : !account.isOAuthConnected &&
                    (platform === "instagram" || platform === "tiktok") ? (
                    <div className="mt-4 rounded-md bg-secondary/50 p-3">
                      <p className="text-sm text-muted-foreground mb-2">
                        Metrics require OAuth connection.
                      </p>
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/oauth/${platform}/authorize?accountId=${account.id}`}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Connect {cfg.label}
                      </a>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      No metrics yet. Click sync to fetch.
                    </p>
                  )}
                </>
              ) : (
                /* Not connected — inline connect form */
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Not connected</p>
                  <input
                    type="text"
                    value={connectUrls[platform]}
                    onChange={(e) =>
                      setConnectUrls((prev) => ({ ...prev, [platform]: e.target.value }))
                    }
                    placeholder={cfg.placeholder}
                    className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {connectErrors[platform] && (
                    <p className="text-xs text-red-500">{connectErrors[platform]}</p>
                  )}
                  <button
                    onClick={() => handleConnect(platform)}
                    disabled={connectingPlatform === platform || !connectUrls[platform].trim()}
                    className={`w-full rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${cfg.bg} ${cfg.color} hover:opacity-80`}
                  >
                    {connectingPlatform === platform ? "Connecting..." : `Connect ${cfg.label}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
