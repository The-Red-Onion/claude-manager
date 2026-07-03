# Claude Manager

Self-hosted control center for [Claude Code](https://claude.com/claude-code). Run
it on the machine where you already work (leave the laptop at home), then manage
**all** your Claude sessions from a clean web dashboard or a Telegram bot —
launch new ones, route tasks to a specific session, use a full terminal, spin up
Docker containers, and answer Claude's prompts with a single tap.

It sits in the gap nobody fills: the convenience of a structured UI **and** the
full power of your machine, at the same time.

## Why

- **Multiplexer, not a chat.** See every session at once with live status
  (`working` · `waiting on you` · `idle`). Pick one and send it a task. No
  copy-pasting session IDs.
- **Claude's prompts become buttons.** When Claude asks *"Tabs or spaces?"* or
  needs permission to run a command, you get tappable options — in the browser
  and in Telegram. Answer from your phone; the session continues.
- **Pings with summaries.** When a session finishes or needs you, the bot
  messages you with the result and cost.
- **Full terminal + Docker.** Real `xterm.js` shells, launch/stop containers,
  shell straight into them.
- **Uses your existing Claude login.** Sessions run through the local `claude`
  CLI, so they ride your Pro/Max subscription — no API key, no extra billing.

## Requirements

- Node 20+, [pnpm](https://pnpm.io)
- [`claude`](https://claude.com/claude-code) CLI installed and logged in
- Docker (optional — the Containers page lights up when it's reachable)

## Quick start

```bash
pnpm install          # installs deps (auto-fixes node-pty's spawn-helper perms)
pnpm build            # builds the web app
pnpm start            # serves everything on http://localhost:8799
```

Open **http://localhost:8799**. To reach it from your phone on the same network,
use the `network:` URL the server prints on boot.

Dev mode (hot reload, web on :5173 proxying the API):

```bash
pnpm dev
```

## Telegram remote

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token.
2. Open **Settings → Telegram remote**, paste the token, save.
3. Restart the server, then send `/start` to your bot. The first person to
   `/start` is authorized.

Then:

- `/sessions` — list & open (each is a button)
- `/new <task>` — start a Claude session on a task
- `/term` — open a terminal
- Pick a session, then just **type** to send it a task
- Claude's permission/choice prompts arrive as inline buttons
- You get pinged when a session finishes or needs you

**Mini App:** set `PUBLIC_URL=https://your-tunnel.example` (e.g. a Cloudflare/
ngrok/Tailscale Funnel HTTPS URL) and the bot shows an "Open dashboard" button
that launches the full web UI inside Telegram.

## Configuration

Lives at `~/.claude-manager/config.json` (mode `0600`). Everything is editable
from the Settings page. Env overrides: `PORT`, `PUBLIC_URL`.

## Architecture

```
web/  React + Vite + Tailwind v4 dashboard (xterm.js terminals)
server/
  sessions/   SessionManager — the multiplexer
    claudeSession.ts   Agent SDK, streaming input queue, canUseTool → asks
    ptySession.ts      node-pty shells / docker exec
  http/       Fastify REST + one WebSocket bus
  telegram/   grammY bot (same event bus → inline keyboards + pings)
  docker.ts   dockerode wrapper
```

One typed event bus (`SessionManager`) feeds both the web WebSocket and the
Telegram bot, so a prompt raised by any session shows up everywhere at once.

## Security note

This is a personal remote for **your own** machine: it gives whoever holds the
Telegram bot (or opens the dashboard) full shell access as your user. Keep the
bot token secret, keep the authorized-user allowlist tight, and don't expose the
port to the open internet without a private tunnel (Tailscale, Cloudflare
Access, etc.).

## License

MIT
