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
  title: string;
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
  effort?: string;
  resumeSessionId?: string;
  containerId?: string;
  containerName?: string;
  preview?: string;
  pendingAsk: PendingAsk | null;
  stats: SessionStats;
  exitCode?: number | null;
}

export type ChatEvent =
  | { kind: "user"; text: string; ts: number }
  | { kind: "assistant"; text: string; ts: number }
  | { kind: "tool"; name: string; summary: string; ts: number }
  | { kind: "ask"; ask: PendingAsk; answered?: string; ts: number }
  | { kind: "result"; text: string; stats: SessionStats; isError: boolean; ts: number }
  | { kind: "info"; text: string; ts: number }
  | { kind: "error"; text: string; ts: number };

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: { private: number; public?: number }[];
}

export interface AppConfig {
  port: number;
  host: string;
  telegram: {
    botToken: string;
    allowedUserIds: number[];
    groupChatId: number | null;
    notifyChatId: number | null;
  };
  claude: {
    model: string;
    permissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan";
    effort: "" | "low" | "medium" | "high" | "xhigh" | "max";
    defaultCwd: string;
  };
  stt: {
    provider: "" | "openai" | "groq";
    apiKey: string;
  };
  recentCwds: string[];
}
