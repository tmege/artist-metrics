"use client";

import { useArtists } from "@/contexts/artists-context";
import { Music, Plus } from "lucide-react";
import Link from "next/link";

export default function ArtistsPage() {
  const { artists, loading } = useArtists();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading artists...</p>
      </div>
    );
  }

  if (artists.length === 0) {
    return (
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
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-12 text-center">
      <Music className="mx-auto h-12 w-12 text-muted-foreground" />
      <h4 className="mt-4 text-lg font-semibold">Select an artist</h4>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose an artist from the sidebar, or{" "}
        <Link
          href="/dashboard/artists/new"
          className="text-primary hover:underline"
        >
          add a new one
        </Link>
        .
      </p>
    </div>
  );
}
