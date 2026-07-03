import { EventEmitter } from "node:events";
import fs from "node:fs";
import { nanoid } from "nanoid";
import type { ConfigStore } from "../config.js";
import type {
  ChatEvent,
  CreateSessionRequest,
  PendingAsk,
  SessionInfo,
} from "../types.js";
import { ClaudeSession } from "./claudeSession.js";
import { PtySession } from "./ptySession.js";
import type { Session } from "./session.js";

const ADJ = ["swift", "amber", "quiet", "brave", "lunar", "cobalt", "sunny", "nimble"];
const NOUN = ["falcon", "otter", "cedar", "harbor", "comet", "willow", "raven", "delta"];

function friendlyName(): string {
  return `${ADJ[Math.floor(Math.random() * ADJ.length)]}-${
    NOUN[Math.floor(Math.random() * NOUN.length)]
  }`;
}

// Filler words to drop when naming a session after its first task (EN + RU).
const STOP = new Set([
  "the", "a", "an", "to", "and", "or", "of", "in", "on", "for", "with", "at",
  "please", "pls", "can", "could", "would", "you", "i", "me", "my", "we", "our",
  "this", "that", "it", "is", "are", "be", "just", "some", "any", "let", "lets",
  "help", "want", "need", "make", "do", "so", "then", "now", "also",
  "и", "в", "на", "с", "по", "для", "что", "как", "это", "мне", "я", "ты", "бы",
  "же", "чтобы", "пожалуйста", "надо", "нужно", "можешь", "мой", "моя", "тут",
  "давай", "тип", "короче",
]);

/** Short, meaningful, branch-style name derived from the first task. */
function smartName(prompt: string): string {
  const firstSentence = prompt.split(/[.\n!?;]/)[0] ?? prompt;
  const words = firstSentence
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  const keep = words.filter((w) => w.length > 1 && !STOP.has(w));
  const picked = (keep.length ? keep : words).slice(0, 4);
  const name = picked.join("-").replace(/^-+|-+$/g, "").slice(0, 28);
  return name || friendlyName();
}

/**
 * Owns every live session. Typed event bus that the WS layer and the Telegram
 * bot both subscribe to — one source of truth for the multiplexer.
 */
export class SessionManager extends EventEmitter {
  private sessions = new Map<string, Session>();

  constructor(private config: ConfigStore) {
    super();
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()]
      .map((s) => s.info)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  info(id: string): SessionInfo | undefined {
    return this.sessions.get(id)?.info;
  }

  create(req: CreateSessionRequest): SessionInfo {
    const id = nanoid(8);
    const cfg = this.config.get();
    const cwd = validCwd(req.cwd || cfg.claude.defaultCwd);

    const autoName =
      req.kind === "claude" && req.prompt?.trim()
        ? smartName(req.prompt)
        : friendlyName();
    const info: SessionInfo = {
      id,
      name: req.name?.trim() || autoName,
      kind: req.kind,
      cwd,
      status: "starting",
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      model: req.kind === "claude" ? req.model ?? cfg.claude.model : undefined,
      permissionMode:
        req.kind === "claude"
          ? req.permissionMode ?? cfg.claude.permissionMode
          : undefined,
      effort:
        req.kind === "claude"
          ? (req.effort ?? cfg.claude.effort) || undefined
          : undefined,
      resumeSessionId: req.kind === "claude" ? req.resumeSessionId : undefined,
      containerId: req.containerId,
      containerName: req.containerName,
      preview: "",
      pendingAsk: null,
      stats: {},
      exitCode: null,
    };

    let session: Session;
    if (req.kind === "claude") {
      session = new ClaudeSession(
        info,
        {
          onChanged: () => this.emit("sessions_changed"),
          onEvent: (e) => this.emit("chat_event", id, e),
          onAsk: (ask) => this.emit("ask", id, ask),
          onAskResolved: (askId, answer) =>
            this.emit("ask_resolved", id, askId, answer),
          onDone: (summary) => this.emit("done", id, summary),
          onError: (message) => this.emit("session_error", id, message),
        },
        req.prompt?.trim() ||
          (req.resumeSessionId ? "" : "Hello! What can you help me with?"),
      );
    } else {
      session = new PtySession(info, {
        onOutput: (data) => this.emit("output", id, data),
        onChanged: () => this.emit("sessions_changed"),
        onDone: (summary) => this.emit("done", id, summary),
      });
    }

    this.sessions.set(id, session);
    this.config.addRecentCwd(cwd);
    this.emit("session_created", info);
    this.emit("sessions_changed");
    return info;
  }

  /** Last assistant/result text of a session — for previews and .md export. */
  lastAnswer(id: string): { text: string; ts: number } | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    for (let i = s.events.length - 1; i >= 0; i--) {
      const e = s.events[i];
      if (e.kind === "result" || e.kind === "assistant")
        return { text: e.text, ts: e.ts };
    }
    return null;
  }

  sendMessage(id: string, text: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.sendMessage(text);
    return true;
  }

  rename(id: string, name: string): boolean {
    const s = this.sessions.get(id);
    const clean = name.trim().slice(0, 60);
    if (!s || !clean) return false;
    s.info.name = clean;
    this.emit("session_renamed", id, clean);
    this.emit("sessions_changed");
    return true;
  }

  /** Switch the model of a live session ('' = CLI default). */
  setModel(id: string, model: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.setModel(model);
    return true;
  }

  write(id: string, data: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.write(data);
    return true;
  }

  answerAsk(id: string, askId: string, keys: string[]): boolean {
    return this.sessions.get(id)?.answerAsk(askId, keys) ?? false;
  }

  interrupt(id: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.interrupt();
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.resize(cols, rows);
    return true;
  }

  kill(id: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.kill();
    this.sessions.delete(id);
    this.emit("sessions_changed");
    return true;
  }

  snapshot(id: string): { info: SessionInfo; buffer: string; events: ChatEvent[] } | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    return { info: s.info, buffer: s.buffer.snapshot(), events: s.events };
  }

  /** Any session currently blocked on a user decision. */
  pendingAsks(): { session: SessionInfo; ask: PendingAsk }[] {
    return this.list()
      .filter((i) => i.pendingAsk)
      .map((i) => ({ session: i, ask: i.pendingAsk! }));
  }

  killAll() {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }
}

function validCwd(cwd: string): string {
  try {
    if (fs.statSync(cwd).isDirectory()) return cwd;
  } catch {
    /* fall through */
  }
  return process.env.HOME || process.cwd();
}
