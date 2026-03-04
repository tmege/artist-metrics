"use client";

import { useState } from "react";
import { Music, Settings, ChevronDown, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArtistsProvider, useArtists } from "@/contexts/artists-context";

function Sidebar() {
  const pathname = usePathname();
  const { artists, loading } = useArtists();
  const [artistsOpen, setArtistsOpen] = useState(true);

  const isSettingsActive = pathname.startsWith("/dashboard/settings");

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col">
      <div className="p-6">
        <Link href="/dashboard/artists">
          <h1 className="text-xl font-bold text-primary">ArtistMetrics</h1>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {/* Artists tree */}
        <button
          type="button"
          onClick={() => setArtistsOpen(!artistsOpen)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
        >
          <Music className="h-4 w-4" />
          <span className="flex-1 text-left">Artists</span>
          {artistsOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {artistsOpen && (
          <div className="ml-4 space-y-0.5">
            {loading ? (
              <p className="px-3 py-1.5 text-xs text-muted-foreground">Loading...</p>
            ) : artists.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-muted-foreground">No artists yet</p>
            ) : (
              artists.map((artist) => {
                const isActive = pathname === `/dashboard/artists/${artist.id}`;
                return (
                  <Link
                    key={artist.id}
                    href={`/dashboard/artists/${artist.id}`}
                    className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-secondary text-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    {artist.name}
                  </Link>
                );
              })
            )}
            <Link
              href="/dashboard/artists/new"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Artist
            </Link>
          </div>
        )}
      </nav>

      {/* Settings at bottom */}
      <div className="px-3 pb-4">
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            isSettingsActive
              ? "bg-secondary text-foreground font-medium"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const pageTitle = pathname.startsWith("/dashboard/settings")
    ? "Settings"
    : pathname.startsWith("/dashboard/artists")
      ? "Artists"
      : "ArtistMetrics";

  return (
    <ArtistsProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <header className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">{pageTitle}</h2>
          </header>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </ArtistsProvider>
  );
}
