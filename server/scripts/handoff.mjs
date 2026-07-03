#!/usr/bin/env node
/**
 * Hand off the newest Claude CLI session in the current directory to
 * Claude Manager, so you can continue it from Telegram / the web UI.
 *
 * Usage:  node handoff.mjs [session-uuid]
 * Tip:    alias cmh='node "$HOME/Desktop/claude manager/server/scripts/handoff.mjs"'
 */

const port = process.env.CLAUDE_MANAGER_PORT || 8799;
const sessionId = process.argv[2];
const body = sessionId ? { sessionId } : { cwd: process.cwd() };

try {
  const res = await fetch(`http://localhost:${port}/api/handoff`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    console.error(`✗ ${json.error || res.statusText}`);
    process.exit(1);
  }
  const note = json.alreadyAdopted ? " (already adopted)" : "";
  console.log(
    `✓ "${json.session.name}" handed off${note} — continue it from Telegram or http://localhost:${port}`,
  );
} catch {
  console.error(`✗ Claude Manager isn't running on :${port} (pnpm start)`);
  process.exit(1);
}
