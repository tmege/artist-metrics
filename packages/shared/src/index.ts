import { z } from "zod";

// ── API Response Types ──

export const apiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Health Check ──

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "error"]),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ── Artist Types ──

export const artistSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Artist = z.infer<typeof artistSchema>;

export const createArtistSchema = z.object({
  name: z.string().min(1).max(200),
  imageUrl: z.string().url().optional(),
});

export type CreateArtist = z.infer<typeof createArtistSchema>;

// ── Social Account Types ──

export const platformSchema = z.enum(["youtube", "instagram", "tiktok"]);
export type Platform = z.infer<typeof platformSchema>;

export const socialAccountSchema = z.object({
  id: z.string().uuid(),
  artistId: z.string().uuid(),
  platform: platformSchema,
  platformAccountId: z.string(),
  username: z.string().nullable(),
  isOAuthConnected: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SocialAccount = z.infer<typeof socialAccountSchema>;

export const connectSocialAccountSchema = z.object({
  platform: platformSchema,
  url: z.string().min(1),
});

export type ConnectSocialAccount = z.infer<typeof connectSocialAccountSchema>;

// ── Social Metrics Types ──

export const socialMetricsSchema = z.object({
  id: z.string().uuid(),
  socialAccountId: z.string().uuid(),
  followers: z.number().nullable(),
  views: z.number().nullable(),
  posts: z.number().nullable(),
  likes: z.number().nullable(),
  engagementRate: z.number().nullable(),
  platformData: z.unknown().nullable(),
  fetchedAt: z.string().datetime(),
});

export type SocialMetrics = z.infer<typeof socialMetricsSchema>;
