import type { ChatEvent, PendingAsk, SessionInfo } from "../types.js";
import type { RingBuffer } from "./ringBuffer.js";

/** Common surface implemented by ClaudeSession and PtySession. */
export interface Session {
  readonly info: SessionInfo;
  readonly buffer: RingBuffer;
  /** Structured transcript (claude sessions; empty for pty). */
  readonly events: ChatEvent[];

  /** Raw terminal input (pty sessions). No-op for claude sessions. */
  write(data: string): void;
  /** A user chat message / task. For pty: writes text + Enter. */
  sendMessage(text: string): void;
  /** Answer a pending ask (permission or question). */
  answerAsk(askId: string, keys: string[]): boolean;
  /** Switch the model ('' = default). Live for claude sessions; no-op for pty. */
  setModel(model: string): void;
  interrupt(): void;
  kill(): void;
  resize(cols: number, rows: number): void;
}

export interface SessionEvents {
  /** Any change to session list / statuses / previews */
  sessions_changed: () => void;
  /** Raw terminal output (pty) */
  output: (sessionId: string, data: string) => void;
  /** Structured event appended (claude) */
  chat_event: (sessionId: string, event: ChatEvent) => void;
  /** Claude asks something — surface buttons everywhere */
  ask: (sessionId: string, ask: PendingAsk) => void;
  ask_resolved: (sessionId: string, askId: string, answer: string) => void;
  /** Session finished a task (claude result) or exited (pty) */
  done: (
    sessionId: string,
    summary: { text: string; isError: boolean },
  ) => void;
  session_error: (sessionId: string, message: string) => void;
}
