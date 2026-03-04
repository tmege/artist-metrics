"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Music,
  Users,
  Eye,
  Heart,
  Play,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";

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

const platformConfig = {
  youtube: { label: "YouTube", color: "text-red-500", bg: "bg-red-500/10" },
  instagram: { label: "Instagram", color: "text-pink-500", bg: "bg-pink-500/10" },
  tiktok: { label: "TikTok", color: "text-cyan-400", bg: "bg-cyan-400/10" },
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
  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [connectPlatform, setConnectPlatform] = useState<string>("");
  const [connectUrl, setConnectUrl] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

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

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setConnectError(null);
    setConnectLoading(true);

    try {
      await apiFetch(`/artists/${artistId}/social-accounts`, {
        method: "POST",
        body: JSON.stringify({
          platform: connectPlatform,
          url: connectUrl,
        }),
      });
      setShowConnect(false);
      setConnectUrl("");
      setConnectPlatform("");
      fetchArtist();
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : "Failed to connect account"
      );
    } finally {
      setConnectLoading(false);
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

  // Connected platforms
  const connectedPlatforms = new Set(
    artist.socialAccounts.map((a) => a.platform)
  );
  const availablePlatforms = (
    ["youtube", "instagram", "tiktok"] as const
  ).filter((p) => !connectedPlatforms.has(p));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/artists"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to artists
        </Link>
      </div>

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

      {/* KPI Summary */}
      {artist.socialAccounts.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Total Followers",
              value: artist.socialAccounts.reduce(
                (sum, a) => sum + (a.latestMetrics?.followers || 0),
                0
              ),
              icon: Users,
            },
            {
              label: "Total Views",
              value: artist.socialAccounts.reduce(
                (sum, a) => sum + (a.latestMetrics?.views || 0),
                0
              ),
              icon: Eye,
            },
            {
              label: "Total Likes",
              value: artist.socialAccounts.reduce(
                (sum, a) => sum + (a.latestMetrics?.likes || 0),
                0
              ),
              icon: Heart,
            },
            {
              label: "Total Posts",
              value: artist.socialAccounts.reduce(
                (sum, a) => sum + (a.latestMetrics?.posts || 0),
                0
              ),
              icon: Play,
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-lg border border-border bg-card p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-2xl font-bold">
                {formatNumber(kpi.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Social Accounts */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold">Social Accounts</h4>
          {availablePlatforms.length > 0 && (
            <button
              onClick={() => setShowConnect(true)}
              className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Connect Account
            </button>
          )}
        </div>

        {/* Connect Modal */}
        {showConnect && (
          <form
            onSubmit={handleConnect}
            className="rounded-lg border border-primary/30 bg-card p-6 space-y-4"
          >
            <h5 className="font-semibold">Connect Social Account</h5>
            <div>
              <label className="block text-sm font-medium text-foreground">
                Platform
              </label>
              <select
                value={connectPlatform}
                onChange={(e) => setConnectPlatform(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select platform</option>
                {availablePlatforms.map((p) => (
                  <option key={p} value={p}>
                    {platformConfig[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">
                Profile URL or Handle
              </label>
              <input
                type="text"
                name="social-url"
                autoComplete="off"
                value={connectUrl}
                onChange={(e) => setConnectUrl(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={
                  connectPlatform === "youtube"
                    ? "https://youtube.com/@handle or channel URL"
                    : connectPlatform === "instagram"
                      ? "https://instagram.com/username or @username"
                      : "https://tiktok.com/@username or @username"
                }
              />
            </div>
            {connectError && (
              <p className="text-sm text-red-500">{connectError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={connectLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {connectLoading ? "Connecting..." : "Connect"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConnect(false);
                  setConnectError(null);
                }}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {artist.socialAccounts.length === 0 && !showConnect ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              No social accounts connected yet. Connect a platform to start
              tracking metrics.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {artist.socialAccounts.map((account) => {
              const cfg = platformConfig[account.platform];
              const m = account.latestMetrics;

              return (
                <div
                  key={account.id}
                  className="rounded-lg border border-border bg-card p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${cfg.color} ${cfg.bg}`}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-sm font-medium">
                        {account.username || account.platformAccountId}
                      </span>
                      {account.isOAuthConnected && (
                        <span className="text-xs text-emerald-500">
                          OAuth connected
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
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
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDisconnect(account.id);
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                        title="Disconnect"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {m ? (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Followers
                          </p>
                          <p className="text-lg font-semibold">
                            {formatNumber(m.followers)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Views</p>
                          <p className="text-lg font-semibold">
                            {formatNumber(m.views)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Likes</p>
                          <p className="text-lg font-semibold">
                            {formatNumber(m.likes)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Posts</p>
                          <p className="text-lg font-semibold">
                            {formatNumber(m.posts)}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Last synced:{" "}
                        {new Date(m.fetchedAt).toLocaleString()}
                      </p>
                    </>
                  ) : !account.isOAuthConnected &&
                    (account.platform === "instagram" ||
                      account.platform === "tiktok") ? (
                    <div className="mt-4 rounded-md bg-secondary/50 p-4 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Metrics require OAuth connection.
                      </p>
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/oauth/${account.platform}/authorize?accountId=${account.id}`}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
                      >
                        Connect {account.platform === "instagram" ? "Instagram" : "TikTok"}
                      </a>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
