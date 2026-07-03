import type { SessionInfo, SessionStatus } from "../types.js";

export const STATUS_EMOJI: Record<SessionStatus, string> = {
  starting: "🔵",
  working: "🟢",
  waiting_input: "🟡",
  idle: "⚪️",
  exited: "⚫️",
  error: "🔴",
};

export const STATUS_LABEL: Record<SessionStatus, string> = {
  starting: "starting",
  working: "working",
  waiting_input: "waiting on you",
  idle: "idle",
  exited: "exited",
  error: "error",
};

const KIND_EMOJI: Record<string, string> = {
  claude: "✦",
  shell: "❯",
  docker: "🐳",
};

export function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
}

/**
 * Convert Claude's markdown into Telegram-flavoured HTML.
 * Code blocks/inline code are stashed first so their contents are only
 * HTML-escaped, never markdown-processed.
 */
export function mdToHtml(md: string): string {
  const chunks: string[] = [];
  const stash = (html: string) => `\u0000${chunks.push(html) - 1}\u0000`;

  // Fenced code blocks (```lang ... ```)
  let text = md.replace(/```([\w+-]*)[^\S\n]*\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const cls = lang ? ` class="language-${lang}"` : "";
    return stash(
      `<pre><code${cls}>${esc(String(code).replace(/\n$/, ""))}</code></pre>`,
    );
  });
  // Inline code
  text = text.replace(/`([^`\n]+)`/g, (_m, code) => stash(`<code>${esc(code)}</code>`));

  text = esc(text);

  // Headings → bold line
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
  // Bold / italic / strikethrough
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  text = text.replace(/__([^_\n]+)__/g, "<b>$1</b>");
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/gm, "$1<i>$2</i>");
  text = text.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
  // Links [text](url)
  text = text.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2">$1</a>',
  );
  // Bullets and blockquotes
  text = text.replace(/^[ \t]*[-*]\s+/gm, "• ");
  text = text.replace(/^&gt;\s?/gm, "▍ ");

  // Restore stashed code
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, i) => chunks[Number(i)] ?? "");
  return text;
}

/** Fallback: turn our Telegram HTML back into readable plain text. */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Strip ANSI escape codes + carriage-return overwrites from pty output. */
export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC sequences
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "") // CSI sequences
    .replace(/\x1b[@-Z\\^_]/g, "") // other escapes
    .replace(/\r+\n/g, "\n")
    .replace(/^[^\n]*\r(?!\n)/gm, "") // CR overwrites the line
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

export function timeAgo(ts: number): string {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function safeFilename(name: string): string {
  return (
    name
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "file"
  );
}

export function sessionLine(s: SessionInfo): string {
  const kind = KIND_EMOJI[s.kind] ?? "•";
  const preview = s.preview ? ` — <i>${esc(s.preview.slice(0, 50))}</i>` : "";
  const when =
    s.status === "working" || s.status === "starting"
      ? ""
      : ` <i>· ${timeAgo(s.lastActivityAt)} ago</i>`;
  return `${STATUS_EMOJI[s.status]} ${kind} <b>${esc(s.name)}</b>${when}${preview}`;
}

export function sessionDetail(
  s: SessionInfo,
  lastAnswer?: string | null,
): string {
  const lines = [
    `${STATUS_EMOJI[s.status]} <b>${esc(s.name)}</b> · ${s.kind}`,
    `<code>${esc(s.cwd)}</code>`,
    `status: ${STATUS_LABEL[s.status]} · <i>${timeAgo(s.lastActivityAt)} ago</i>`,
  ];
  if (s.stats.costUsd != null)
    lines.push(`cost: $${s.stats.costUsd.toFixed(3)} · turns: ${s.stats.turns ?? 0}`);
  if (s.pendingAsk) lines.push(`⏳ <b>${esc(s.pendingAsk.title)}</b>`);
  if (lastAnswer && lastAnswer.trim()) {
    const snip = lastAnswer.trim().replace(/\s+/g, " ").slice(0, 320);
    lines.push("", `💬 <i>${esc(snip)}${lastAnswer.length > 320 ? "…" : ""}</i>`);
  }
  return lines.join("\n");
}
