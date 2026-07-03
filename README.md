<div align="center">

# chill & vibe w/ claude

**Leave your laptop at home. Run all your Claude Code sessions from the couch, the beach, or your phone.**

A self-hosted control center for [Claude Code](https://claude.com/claude-code): a session
multiplexer with a clean web dashboard and a Telegram bot that turns Claude's prompts into
tappable buttons. It rides your existing Claude login — no API key, no extra billing.

</div>

---

It sits in the gap nobody fills: the **convenience of a structured UI** and the **full power of
your machine**, at the same time. Not a chat wrapper — a mission control for many agents at once.

## What you get

- **Multiplexer, not a chat.** Every session at once with live status (`working` · `waiting on
  you` · `idle` · relative time). Pick one, send it a task. No copy-pasting session IDs.
- **Claude's prompts become buttons.** When Claude asks *"Tabs or spaces?"* or wants permission to
  run a command, you get tappable options — in the browser and in Telegram. Tap from your phone;
  the session continues.
- **Pings with summaries.** When a session finishes or needs you, the bot messages you the result
  and cost, and attaches the full answer as a `.md` when it's long.
- **A supergroup that sorts itself.** Bind a Telegram supergroup and every session becomes its own
  **forum topic**, auto-organized, with a **📁 Files** topic that archives everything the bot sends.
- **Talk however you like.** Type, send a **voice note** (Whisper transcription), or drop a **file** —
  it's saved and handed to the session.
- **Hand off from your laptop.** `/adopt` continues a Claude CLI session you started at your desk,
  full history intact.
- **Full terminal + Docker.** Real `xterm.js` shells, launch/stop containers, shell straight in.
- **Uses your Claude login.** Sessions run through the local `claude` CLI, so they use your Pro/Max
  subscription. No API key, no metered spend.

## Requirements

- Node 20+, [pnpm](https://pnpm.io)
- [`claude`](https://claude.com/claude-code) CLI installed and logged in
- Docker (optional — the Containers page lights up when it's reachable)

## Quick start

```bash
pnpm install    # installs deps (auto-fixes node-pty's spawn-helper perms)
pnpm build      # builds the web app
pnpm start      # serves everything on http://localhost:8799
```

Open **http://localhost:8799**. To reach it from your phone on the same network, use the
`network:` URL the server prints on boot. Env overrides: `PORT`, `PUBLIC_URL`.

Dev mode (hot reload, web on `:5173` proxying the API): `pnpm dev`.

## Telegram remote

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token.
2. Open **Settings → Telegram remote**, paste the token, save. Restart the server.
3. Send `/start` to your bot. The first person to `/start` is the authorized owner.

**Commands**

| Command | What it does |
|---|---|
| `/sessions` | List & open every session (relative time + last-answer preview) |
| `/new <task>` | Start a Claude session on a task (auto-named from the task) |
| `/adopt` | Continue a Claude session you started on your laptop |
| `/term` | Open a terminal (shell) |
| `/bindgroup` | Use the current supergroup — a topic per session |
| `/model`, `/effort` | Switch model live / set default reasoning effort |
| `/rename`, `/kill`, `/get <path>` | Rename, close, or fetch a file from the machine |

**Routing (built to avoid accidents).** In a private chat, nothing fires on a stray message — you
**reply** to a session's message (text, voice, or file) to send it there. In a bound supergroup,
each session is its own topic, so you just type inside the topic.

**Voice.** Add an OpenAI or Groq (free tier) key in **Settings → Voice transcription** and send
voice notes; they're transcribed and dispatched.

## Remote access

On your home network the `network:` URL just works. To reach it from anywhere, put it behind a
private tunnel — [Tailscale](https://tailscale.com), Cloudflare Access, or an SSH tunnel. Don't
expose the raw port to the open internet.

## Architecture

```
web/  React + Vite + Tailwind v4 dashboard (xterm.js terminals)
server/
  sessions/   SessionManager — the multiplexer
    claudeSession.ts   Agent SDK, streaming input queue, canUseTool → tappable asks
    ptySession.ts      node-pty shells / docker exec
  http/       Fastify REST + one WebSocket bus
  telegram/   grammY bot (same event bus → inline keyboards, pings, forum topics)
  docker.ts   dockerode wrapper
```

One typed event bus (`SessionManager`) feeds both the web WebSocket and the Telegram bot, so a
prompt raised by any session shows up everywhere at once — dashboard, private chat, and its topic.

## Security note

This is a personal remote for **your own** machine: whoever holds the Telegram bot (or opens the
dashboard) gets shell access as your user. Keep the token secret, keep the authorized-user list
tight, and reach it through a private tunnel — never the open internet.

## License

[MIT](LICENSE) — do whatever, have fun.
