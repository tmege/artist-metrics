# ArtistMetrics

Analytics dashboard for music artists. Track followers, views, engagement and growth across social media and streaming platforms.

![ArtistMetrics Dashboard](screenshots/Screenshot%202026-03-04%20at%2020-37-33%20ArtistMetrics.png)

![ArtistMetrics Dashboard — Artist detail](screenshots/Screenshot%202026-03-06%20at%2001-57-16%20ArtistMetrics.png)

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/ui
- **Backend**: Fastify 5, Zod, Pino
- **Database**: Supabase (PostgreSQL) + Drizzle ORM
- **Auth**: Supabase Auth (email/password)
- **Monorepo**: pnpm workspaces

## Project Structure

```
artist-dashboard/
├── apps/
│   ├── web/                        # Next.js frontend (port 3000)
│   │   ├── src/app/
│   │   │   ├── login/              # Login page
│   │   │   ├── signup/             # Signup page
│   │   │   └── dashboard/
│   │   │       ├── page.tsx        # Redirects to /dashboard/artists
│   │   │       ├── settings/       # Change password, sign out
│   │   │       └── artists/
│   │   │           ├── page.tsx    # Artist selection prompt
│   │   │           ├── new/        # Create artist
│   │   │           └── [id]/       # Artist detail (social + streaming cards)
│   │   ├── src/components/
│   │   │   └── metrics-chart.tsx   # Time-series chart (Recharts) with Social Blade history
│   │   ├── src/contexts/
│   │   │   └── artists-context.tsx # Shared artists list (React Context)
│   │   ├── src/lib/
│   │   │   ├── api.ts             # API client with auth headers
│   │   │   └── supabase/          # Supabase client (browser + server)
│   │   └── src/middleware.ts       # Auth redirects
│   └── api/                        # Fastify backend (port 3001)
│       └── src/
│           ├── config/env.ts       # Environment validation (Zod)
│           ├── db/
│           │   ├── schema.ts       # Drizzle schema (users, artists, social_accounts, social_metrics)
│           │   └── index.ts        # DB connection factory
│           ├── plugins/
│           │   ├── auth.ts         # Supabase JWT validation
│           │   ├── db.ts           # Database Fastify plugin
│           │   ├── cors.ts         # CORS
│           │   ├── helmet.ts       # Security headers
│           │   └── rate-limit.ts   # Rate limiting
│           ├── routes/
│           │   ├── health.ts       # GET /health
│           │   ├── artists.ts      # CRUD /artists
│           │   ├── social-accounts.ts  # Link/unlink/sync social + streaming accounts
│           │   └── oauth.ts        # Instagram & TikTok OAuth flows
│           ├── services/
│           │   ├── youtube.ts      # YouTube Data API v3 (public API key)
│           │   ├── instagram.ts    # Instagram Graph API (OAuth)
│           │   ├── tiktok.ts       # TikTok API (OAuth)
│           │   ├── streaming.ts    # Spotify, Deezer, Apple Music, YouTube Music
│           │   └── socialblade.ts  # Social Blade historical metrics
│           ├── jobs/
│           │   └── sync-metrics.ts # Background sync every 6h
│           └── lib/
│               ├── crypto.ts       # AES-256-GCM token encryption
│               └── logger.ts       # Pino logger config
└── packages/
    └── shared/                     # Shared Zod schemas & TypeScript types
```

## Platforms

### Social Media

| Platform | Auth | Metrics |
|---|---|---|
| **YouTube** | API key (free) | Subscribers, views, videos |
| **Instagram** | OAuth required | Followers, posts, likes, insights |
| **TikTok** | OAuth required | Followers, likes, videos, views |

> **Note:** Meta (Instagram) and TikTok OAuth require app review and verification before API access is granted.

### Streaming

| Platform | Auth | Metrics | Limitations |
|---|---|---|---|
| **Spotify** | Embed scraping + optional [API credentials](https://developer.spotify.com/dashboard) | Top songs, followers, popularity, genres | Top songs always available; followers/popularity/genres require Spotify app in Extended Quota Mode |
| **Deezer** | None (free public API) | Fans, albums | No stream counts — Deezer for Creators has no public API |
| **Apple Music** | None (scrapes public page) | Artist name + image | No metrics at all — Apple exposes nothing publicly, and Apple Music for Artists has no API |
| **YouTube Music** | YouTube API key (shared) | Subscribers, views, videos, top 5 songs | Full data via YouTube Data API |

All platforms are linked via URL and fetch available stats immediately on connect.

### Why no stream counts?

Streaming analytics (play counts, listener demographics, revenue) are locked behind private artist dashboards:

- **Spotify for Artists** — API restricted to Spotify partners, no public access even with OAuth
- **Apple Music for Artists** — No API whatsoever, web dashboard only
- **Deezer for Creators** — No API, web dashboard only

OAuth login for these platforms gives access to **listener** data (playlists, listening history), not **artist** analytics.

> **Future improvement:** Full streaming analytics (stream counts, listener demographics, playlist placements) could be unlocked by integrating a paid third-party aggregator API such as [Chartmetric](https://chartmetric.com) or [Soundcharts](https://soundcharts.com). Same situation as Instagram/TikTok where the Meta Developer and TikTok APIs require app review — these are gated integrations that would extend the dashboard's capabilities significantly.

### Historical Charts (Social Blade)

Metrics charts can display up to 30 days of history via Social Blade scraping (no key needed), or extended history with a Social Blade API key.

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- A [Supabase](https://supabase.com) project (free tier works)

### Setup

```bash
# Install dependencies
pnpm install

# Copy env file and fill in values
cp .env.example .env

# Run Drizzle migrations
pnpm --filter api drizzle-kit migrate

# Start both servers (API + Web)
./dev.sh
```

### Verify

```bash
# Health check
curl http://localhost:3001/health
# → { "status": "ok" }
```

## Environment Variables

See `.env.example` for all variables. Required ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `TOKEN_ENCRYPTION_KEY` | 32+ char key for encrypting OAuth tokens |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL (frontend) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (frontend) |
| `NEXT_PUBLIC_API_URL` | Backend URL (default: http://localhost:3001) |

Optional (enable platform integrations):

| Variable | Description |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 key (also used by YouTube Music) |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Facebook App credentials |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok Developer App credentials |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify Developer App credentials |
| `SOCIALBLADE_CLIENT_ID` / `SOCIALBLADE_TOKEN` | Social Blade API (extended history) |

## Scripts

| Command | Description |
|---|---|
| `./dev.sh` | Start both servers (API + Web) |
| `pnpm dev:web` | Start frontend dev server |
| `pnpm dev:api` | Start backend dev server |
| `pnpm build:web` | Build frontend for production |
| `pnpm build:api` | Build backend for production |
| `pnpm lint` | Run linting across all packages |
| `pnpm typecheck` | Type-check across all packages |
