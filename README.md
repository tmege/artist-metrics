# ArtistMetrics

Analytics dashboard for music artists. Track followers, views, engagement and growth across YouTube, Instagram and TikTok.

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
│   │   │       ├── page.tsx        # Dashboard home (KPIs)
│   │   │       └── artists/
│   │   │           ├── page.tsx    # Artists list
│   │   │           ├── new/        # Create artist
│   │   │           └── [id]/       # Artist detail + social metrics
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
│           │   ├── social-accounts.ts  # Link/unlink/sync social accounts
│           │   └── oauth.ts        # Instagram & TikTok OAuth flows
│           ├── services/
│           │   ├── youtube.ts      # YouTube Data API v3 (public API key)
│           │   ├── instagram.ts    # Instagram Graph API (OAuth)
│           │   └── tiktok.ts       # TikTok API (OAuth)
│           ├── jobs/
│           │   └── sync-metrics.ts # Background sync every 6h
│           └── lib/
│               ├── crypto.ts       # AES-256-GCM token encryption
│               └── logger.ts       # Pino logger config
└── packages/
    └── shared/                     # Shared Zod schemas & TypeScript types
```

## Social Platforms

| Platform | Without OAuth | With OAuth |
|---|---|---|
| **YouTube** | Subscribers, views, videos (API key) | Advanced analytics |
| **Instagram** | Link by username (no metrics) | Followers, posts, likes, insights |
| **TikTok** | Link by username (no metrics) | Followers, likes, videos, views |

All platforms can be linked via URL or handle. YouTube fetches public stats immediately via API key. Instagram and TikTok require OAuth to fetch metrics.

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

# Start backend
pnpm dev:api

# Start frontend (in another terminal)
pnpm dev:web
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
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Facebook App credentials |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok Developer App credentials |

## Scripts

| Command | Description |
|---|---|
| `pnpm dev:web` | Start frontend dev server |
| `pnpm dev:api` | Start backend dev server |
| `pnpm build:web` | Build frontend for production |
| `pnpm build:api` | Build backend for production |
| `pnpm lint` | Run linting across all packages |
| `pnpm typecheck` | Type-check across all packages |
