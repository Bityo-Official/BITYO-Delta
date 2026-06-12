# HedgeBook · 跨所合約記帳

A multi-user, responsive (RWD) dashboard for tracking **cross-exchange crypto futures
positions and hedges** with live data. Built with **Next.js + TypeScript**, a custom
Node WebSocket server, Prisma/SQLite, and per-exchange REST/WS adapters.

## Features

- **Single RWD dashboard** — 總覽 / 對沖監控 / 記帳 / 資產 / 設定. Collapsible sidebar on
  desktop, slide-in drawer on mobile. Light/dark + 4 accent themes.
- **Multi-user auth** — self-built email + password (bcrypt) with JWT cookie sessions.
- **Encrypted API keys** — exchange secrets stored AES-256-GCM encrypted; never returned
  to the browser. Read-only keys recommended.
- **Live data over WebSocket** — the server pushes a full portfolio snapshot on connect
  and every 12s, and streams real-time mark-price ticks from exchange public WS feeds in
  between (positions' uPnL/ROE update live in the UI).
- **Cross-exchange hedge detection** — automatically pairs same-coin long/short legs across
  different venues, and computes net Delta, basis, and funding-rate arbitrage.
- **Demo fallback** — logged-out / no-keys users see live demo data (real BTC/ETH/SOL marks).

## Exchanges

| Exchange | Status | Notes |
|----------|--------|-------|
| Binance  | ✅ implemented to documented v1/v2 fapi | positions, balance, funding, realized PnL |
| Bybit    | ✅ implemented to V5 docs | unified account, closed-pnl |
| OKX      | ✅ implemented to V5 docs | needs passphrase |
| BingX    | ⚠️ unverified | implemented to spec, confirm with a live key |
| Bitget   | ⚠️ unverified | needs passphrase |
| Bitunix  | ⚠️ unverified | double-SHA256 signing; live mark-price polling confirmed working |
| Pionex   | ⚠️ unverified | documented HMAC signing; perp position endpoint best-effort (`lib/exchanges/pionex.ts`) |

"Verified" adapters (Binance/Bybit/OKX) match published API docs; live ticks are confirmed
working via each venue's public WebSocket. The unverified ones follow documented signing
but should be tested with a real read-only key — failures are surfaced per-account in 設定.

### Live updates

- **Binance / Bybit / OKX** — real-time mark prices via each venue's public **WebSocket**.
- **BingX / Bitget / Bitunix / Pionex** — public mark prices **polled every 3s** (`lib/ws/markPoll.ts`),
  since they aren't on the WS multiplexer. Positions' mark price + uPnL update live either way.
- All clients also receive a full re-synced snapshot every 12s.

## Setup

```bash
pnpm install
cp .env.example .env          # then fill ENCRYPTION_KEY + SESSION_SECRET
#   openssl rand -hex 32      # generate each
pnpm db:push                  # create the SQLite schema
pnpm dev                      # http://localhost:3000  (Next + /ws on one port)
```

Production: `pnpm build && pnpm start`.

## Architecture

```
server.ts                 custom Node server: Next HTTP + WebSocketServer at /ws
app/                      App Router — dashboard, /login, /register, /api/*
  api/auth/*              register / login / logout
  api/accounts/*          CRUD encrypted exchange keys + connectivity test
  api/portfolio           aggregated cross-exchange snapshot (REST)
lib/
  auth.ts crypto.ts db.ts bcrypt+JWT · AES-256-GCM · Prisma client
  exchanges/              adapter per venue + normalized types + registry
  portfolio.ts            decrypt keys, fan out to adapters, aggregate
  derive.ts               client-safe totals / hedge detection / exposure / tick merge
  ws/hub.ts ws/markStreams.ts  browser client hub + upstream public mark-price multiplexer
components/
  DataProvider.tsx        REST + WS client, merges live ticks into positions
  dashboard/              RWD Shell + pages + settings + detail modal
  primitives.tsx          shared UI atoms
```

## Security notes

- `ENCRYPTION_KEY` and `SESSION_SECRET` in the committed `.env` are placeholders — **replace
  them** before any real use. Rotating `ENCRYPTION_KEY` invalidates stored secrets.
- Only grant exchange API keys **read / positions** permission. Never enable withdraw/trade.
- For production, switch Prisma to Postgres and serve over HTTPS (cookies become `secure`).
