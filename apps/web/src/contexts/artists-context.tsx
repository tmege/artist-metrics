"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface Artist {
  id: string;
  name: string;
  imageUrl: string | null;
  createdAt: string;
}

interface ArtistsContextValue {
  artists: Artist[];
  loading: boolean;
  refreshArtists: () => Promise<void>;
}

const ArtistsContext = createContext<ArtistsContextValue | null>(null);

export function ArtistsProvider({ children }: { children: React.ReactNode }) {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshArtists = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: Artist[] }>("/artists");
      setArtists(res.data);
    } catch {
      // Silently fail — artists list will remain empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshArtists();
  }, [refreshArtists]);

  return (
    <ArtistsContext.Provider value={{ artists, loading, refreshArtists }}>
      {children}
    </ArtistsContext.Provider>
  );
}

export function useArtists() {
  const ctx = useContext(ArtistsContext);
  if (!ctx) throw new Error("useArtists must be used within ArtistsProvider");
  return ctx;
}
