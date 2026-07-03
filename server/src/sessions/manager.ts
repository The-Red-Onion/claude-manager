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

    const info: SessionInfo = {
      id,
      name: req.name?.trim() || friendlyName(),
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
    this.emit("sessions_changed");
    return info;
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
