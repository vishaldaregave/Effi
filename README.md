# Effi v2

Effi turns natural civic reports into evidence-backed cases officers can act on.

A citizen reports an issue through Telegram, WhatsApp, or the Expo app. Effi confirms the report, stores it in Convex, and gives it a report number. An officer opens the case in the dashboard, inspects the evidence, and moves it through resolution.

## Requirements

- Node.js 22 or later
- Corepack (`corepack enable`)
- A Convex deployment with Clerk configured for the dashboard, the app, and the gateway
- OpenCode Zen access for the bot gateway model; the start script reads the credential from `~/.local/share/opencode/auth.json`
- `ngrok` for the Telegram webhook

## Local setup

```sh
corepack enable
corepack pnpm install
```

Copy each `.env.example` to `.env.local` and fill it in. The dashboard, app, gateway, and Convex deployment each have their own values. Keep them out of Git.

## Services

```sh
corepack pnpm --filter @effi/backend convex:dev          # Convex functions and schema
corepack pnpm --filter @effi/officer-dashboard dev       # officer dashboard, port 3000
corepack pnpm --filter @effi/citizen-app android         # Expo app on a device or emulator
./scripts/effi-bot.sh start                              # bot gateway and tunnel
./scripts/effi-bot.sh webhook                            # register the Telegram webhook
```

`docs/demo-runbook.md` has the full start order, the demo sequence, and the fallbacks.

## Workspace

- `apps/officer-dashboard` - Next.js officer console
- `apps/citizen-app` - Expo citizen app
- `apps/bot-gateway` - Eve gateway for Telegram and WhatsApp
- `packages/*` - civic domain, backend, UI, and integration boundaries

Run `pnpm check` before opening a pull request.
............
