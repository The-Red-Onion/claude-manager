export type SessionKind = "claude" | "shell" | "docker";

export type SessionStatus =
  | "starting"
  | "working"
  | "waiting_input"
  | "idle"
  | "exited"
  | "error";

export interface AskOption {
  key: string;
  label: string;
  description?: string;
}

export interface PendingAsk {
  id: string;
  sessionId: string;
  type: "permission" | "question";
  /** Question text or tool name */
  title: string;
  /** Extra context: command being run, file being edited, etc. */
  detail?: string;
  options: AskOption[];
  multiSelect?: boolean;
  createdAt: number;
}

export interface SessionStats {
  costUsd?: number;
  turns?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

export interface SessionInfo {
  id: string;
  name: string;
  kind: SessionKind;
  cwd: string;
  status: SessionStatus;
  createdAt: number;
  lastActivityAt: number;
  model?: string;
  permissionMode?: string;
  /** Reasoning effort for claude sessions ('' = default) */
  effort?: string;
  /** Claude CLI session id this session resumed (handoff) */
  resumeSessionId?: string;
  containerId?: string;
  containerName?: string;
  /** Short preview of the latest activity, for cards and Telegram dashboard */
  preview?: string;
  pendingAsk: PendingAsk | null;
  stats: SessionStats;
  exitCode?: number | null;
  /** Telegram routing: forum topic this session is bound to */
  telegram?: { chatId: number; threadId?: number };
}

/** Structured feed events for Claude sessions (rendered in web transcript) */
export type ChatEvent =
  | { kind: "user"; text: string; ts: number }
  | { kind: "assistant"; text: string; ts: number }
  | { kind: "tool"; name: string; summary: string; ts: number }
  | { kind: "ask"; ask: PendingAsk; answered?: string; ts: number }
  | {
      kind: "result";
      text: string;
      stats: SessionStats;
      isError: boolean;
      ts: number;
    }
  | { kind: "info"; text: string; ts: number }
  | { kind: "error"; text: string; ts: number };

export interface CreateSessionRequest {
  kind: SessionKind;
  name?: string;
  cwd?: string;
  /** First prompt for claude sessions */
  prompt?: string;
  model?: string;
  permissionMode?: string;
  effort?: string;
  /** Resume an existing Claude CLI session (handoff from laptop) */
  resumeSessionId?: string;
  /** For docker sessions */
  containerId?: string;
  containerName?: string;
}

export interface AppConfig {
  port: number;
  host: string;
  telegram: {
    botToken: string;
    allowedUserIds: number[];
    /** Optional forum supergroup: one topic per session */
    groupChatId: number | null;
    /** Private chat to send pings to (captured on /start) */
    notifyChatId: number | null;
  };
  claude: {
    /** '' = CLI default; or 'sonnet' | 'opus' | 'haiku' | full model id */
    model: string;
    permissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan";
    /** '' = default; or 'low' | 'medium' | 'high' | 'xhigh' | 'max' */
    effort: "" | "low" | "medium" | "high" | "xhigh" | "max";
    defaultCwd: string;
  };
  /** Speech-to-text for Telegram voice messages */
  stt: {
    provider: "" | "openai" | "groq";
    apiKey: string;
  };
  recentCwds: string[];
}
