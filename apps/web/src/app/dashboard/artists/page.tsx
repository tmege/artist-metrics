"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Music, Plus } from "lucide-react";

interface Artist {
  id: string;
  name: string;
  imageUrl: string | null;
  createdAt: string;
}

export default function ArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: Artist[] }>("/artists")
      .then((res) => setArtists(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading artists...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Artists</h3>
          <p className="text-muted-foreground">
            Manage your artists and their social media accounts.
          </p>
        </div>
        <Link
          href="/dashboard/artists/new"
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Artist
        </Link>
      </div>

      {artists.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Music className="mx-auto h-12 w-12 text-muted-foreground" />
          <h4 className="mt-4 text-lg font-semibold">No artists yet</h4>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your first artist to start tracking their social media metrics.
          </p>
          <Link
            href="/dashboard/artists/new"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Artist
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {artists.map((artist) => (
            <Link
              key={artist.id}
              href={`/dashboard/artists/${artist.id}`}
              className="rounded-lg border border-border bg-card p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                {artist.imageUrl ? (
                  <img
                    src={artist.imageUrl}
                    alt={artist.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                    <Music className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h4 className="font-semibold">{artist.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(artist.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
