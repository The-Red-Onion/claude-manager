import { nanoid } from "nanoid";
import type {
  AskOption,
  ChatEvent,
  PendingAsk,
  SessionInfo,
} from "../types.js";
import { RingBuffer } from "./ringBuffer.js";
import type { Session } from "./session.js";

// The SDK ships its own types; we keep our usage loosely typed so a minor
// SDK bump can't break the build. Shapes are per the documented API.
type SDKUserMessage = {
  type: "user";
  message: { role: "user"; content: string };
  parent_tool_use_id: string | null;
};

type PermissionResult =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

export interface ClaudeSessionHooks {
  onChanged: () => void;
  onEvent: (event: ChatEvent) => void;
  onAsk: (ask: PendingAsk) => void;
  onAskResolved: (askId: string, answer: string) => void;
  onDone: (summary: { text: string; isError: boolean }) => void;
  onError: (message: string) => void;
}

/** A push-driven async iterable of user messages — keeps one session alive. */
class InputQueue {
  private queue: SDKUserMessage[] = [];
  private waiter: ((r: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;

  push(text: string) {
    const msg: SDKUserMessage = {
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    };
    if (this.waiter) {
      this.waiter({ value: msg, done: false });
      this.waiter = null;
    } else {
      this.queue.push(msg);
    }
  }

  close() {
    this.closed = true;
    if (this.waiter) {
      this.waiter({ value: undefined as any, done: true });
      this.waiter = null;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (this.queue.length) {
        yield this.queue.shift()!;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<SDKUserMessage>>((res) => {
        this.waiter = res;
      });
      if (next.done) return;
      yield next.value;
    }
  }
}

export class ClaudeSession implements Session {
  readonly buffer = new RingBuffer();
  readonly events: ChatEvent[] = [];
  private input = new InputQueue();
  private query: any = null;
  private askResolvers = new Map<
    string,
    { input: Record<string, unknown>; resolve: (r: PermissionResult) => void }
  >();
  private killed = false;

  constructor(
    readonly info: SessionInfo,
    private hooks: ClaudeSessionHooks,
    private firstPrompt: string,
  ) {
    this.info.status = "starting";
    void this.run();
  }

  private async run() {
    let sdk: any;
    try {
      sdk = await import("@anthropic-ai/claude-agent-sdk");
    } catch (err) {
      this.fail(
        "Could not load @anthropic-ai/claude-agent-sdk. Run `pnpm install`.",
      );
      return;
    }

    const options: Record<string, unknown> = {
      cwd: this.info.cwd,
      permissionMode: this.info.permissionMode || "default",
      includePartialMessages: false,
      canUseTool: this.canUseTool.bind(this),
      // Load user's ~/.claude settings + project settings so it behaves like
      // the CLI the user already runs.
      settingSources: ["user", "project", "local"],
    };
    if (this.info.model) options.model = this.info.model;
    if (this.info.effort) options.effort = this.info.effort;
    // Handoff: continue an existing Claude CLI session with its full history.
    if (this.info.resumeSessionId) options.resume = this.info.resumeSessionId;

    // Seed the first task, then keep the queue open for follow-ups.
    // Resumed sessions may start without a prompt — they wait for the user.
    if (this.firstPrompt) {
      this.input.push(this.firstPrompt);
      this.pushUserEvent(this.firstPrompt);
    }

    try {
      this.query = sdk.query({ prompt: this.input, options });
      for await (const message of this.query) {
        if (this.killed) break;
        this.handleMessage(message);
      }
      if (!this.killed) {
        this.info.status = "idle";
        this.hooks.onChanged();
      }
    } catch (err: any) {
      if (!this.killed)
        this.fail(err?.message ? String(err.message) : "Claude session crashed");
    }
  }

  private handleMessage(message: any) {
    this.info.lastActivityAt = Date.now();
    switch (message?.type) {
      case "system":
        if (message.subtype === "init" && message.session_id) {
          const resumed = !!this.info.resumeSessionId;
          this.info.status = this.firstPrompt ? "working" : "idle";
          if (!this.firstPrompt && resumed) {
            this.info.preview = "resumed — send a task";
          }
          this.pushEvent({
            kind: "info",
            text: `Session ${String(message.session_id).slice(0, 8)} ${resumed ? "resumed" : "ready"}`,
            ts: Date.now(),
          });
          this.hooks.onChanged();
        }
        break;

      case "assistant": {
        const blocks = message.message?.content ?? [];
        for (const b of blocks) {
          if (b.type === "text" && b.text?.trim()) {
            this.info.status = "working";
            this.info.preview = firstLine(b.text);
            this.pushEvent({ kind: "assistant", text: b.text, ts: Date.now() });
          } else if (b.type === "tool_use") {
            this.pushEvent({
              kind: "tool",
              name: b.name,
              summary: summarizeTool(b.name, b.input),
              ts: Date.now(),
            });
            this.info.preview = `${b.name}: ${summarizeTool(b.name, b.input)}`;
          }
        }
        this.hooks.onChanged();
        break;
      }

      case "result": {
        const isError = String(message.subtype ?? "").startsWith("error");
        this.info.stats = {
          costUsd: message.total_cost_usd ?? this.info.stats.costUsd,
          turns: message.num_turns ?? this.info.stats.turns,
          inputTokens: message.usage?.input_tokens,
          outputTokens: message.usage?.output_tokens,
          durationMs: message.duration_ms,
        };
        this.info.status = "idle";
        const text = message.result || (isError ? "Task ended with error" : "Done");
        this.info.preview = firstLine(text);
        this.pushEvent({
          kind: "result",
          text,
          stats: this.info.stats,
          isError,
          ts: Date.now(),
        });
        this.hooks.onChanged();
        this.hooks.onDone({ text, isError });
        break;
      }
    }
  }

  /** Fires for every tool that needs approval + for AskUserQuestion. */
  private canUseTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> {
    const askId = nanoid(10);
    let ask: PendingAsk;

    if (toolName === "AskUserQuestion") {
      const questions = (input.questions as any[]) ?? [];
      const q = questions[0] ?? { question: "Claude has a question", options: [] };
      const options: AskOption[] = (q.options ?? []).map((o: any) => ({
        key: o.label,
        label: o.label,
        description: o.description,
      }));
      ask = {
        id: askId,
        sessionId: this.info.id,
        type: "question",
        title: q.question ?? q.header ?? "Question",
        detail: questions.length > 1 ? `+${questions.length - 1} more question(s)` : undefined,
        options,
        multiSelect: !!q.multiSelect,
        createdAt: Date.now(),
      };
    } else {
      ask = {
        id: askId,
        sessionId: this.info.id,
        type: "permission",
        title: toolName,
        detail: summarizeTool(toolName, input),
        options: [
          { key: "allow", label: "✅ Allow" },
          { key: "allow_always", label: "♾️ Allow always" },
          { key: "deny", label: "❌ Deny" },
        ],
        createdAt: Date.now(),
      };
    }

    this.info.status = "waiting_input";
    this.info.pendingAsk = ask;
    this.info.preview = `⏳ ${ask.title}`;
    this.pushEvent({ kind: "ask", ask, ts: Date.now() });
    this.hooks.onChanged();
    this.hooks.onAsk(ask);

    return new Promise<PermissionResult>((resolve) => {
      this.askResolvers.set(askId, { input, resolve });
    });
  }

  answerAsk(askId: string, keys: string[]): boolean {
    const pending = this.askResolvers.get(askId);
    const ask = this.info.pendingAsk;
    if (!pending || !ask || ask.id !== askId) return false;
    this.askResolvers.delete(askId);

    let result: PermissionResult;
    let answerText: string;

    if (ask.type === "question") {
      const chosen = keys.length ? keys : [ask.options[0]?.key ?? ""];
      const questions = (pending.input.questions as any[]) ?? [];
      const answers: Record<string, unknown> = {};
      questions.forEach((q: any, i: number) => {
        // First question gets the user's real choice; extras default to option 0.
        const val =
          i === 0
            ? ask.multiSelect
              ? chosen
              : chosen[0]
            : q.options?.[0]?.label;
        answers[q.question] = val;
      });
      result = {
        behavior: "allow",
        updatedInput: { ...pending.input, answers },
      };
      answerText = chosen.join(", ");
    } else {
      const key = keys[0] ?? "deny";
      if (key === "deny") {
        result = { behavior: "deny", message: "Denied by user" };
        answerText = "Denied";
      } else {
        // allow / allow_always both proceed; "always" is best-effort here.
        result = { behavior: "allow", updatedInput: pending.input };
        answerText = key === "allow_always" ? "Allowed (always)" : "Allowed";
      }
    }

    this.info.pendingAsk = null;
    this.info.status = "working";
    // Mark the transcript ask as answered.
    const ev = [...this.events].reverse().find(
      (e) => e.kind === "ask" && e.ask.id === askId,
    ) as Extract<ChatEvent, { kind: "ask" }> | undefined;
    if (ev) ev.answered = answerText;

    pending.resolve(result);
    this.hooks.onChanged();
    this.hooks.onAskResolved(askId, answerText);
    return true;
  }

  write(_data: string) {
    /* claude sessions are structured; raw tty input is not used */
  }

  setModel(model: string) {
    this.info.model = model || undefined;
    // The SDK supports switching models on a live query.
    Promise.resolve(this.query?.setModel?.(model || undefined)).catch(() => {
      /* not running yet — option applies on info only */
    });
    this.hooks.onChanged();
  }

  sendMessage(text: string) {
    if (this.killed) return;
    this.pushUserEvent(text);
    this.info.status = "working";
    this.info.preview = firstLine(text);
    this.input.push(text);
    this.hooks.onChanged();
  }

  async interrupt() {
    try {
      await this.query?.interrupt?.();
    } catch {
      /* not running */
    }
    this.info.status = "idle";
    this.hooks.onChanged();
  }

  kill() {
    this.killed = true;
    this.input.close();
    try {
      this.query?.interrupt?.();
    } catch {
      /* ignore */
    }
    // Auto-deny anything still pending so promises settle.
    for (const [, p] of this.askResolvers) {
      p.resolve({ behavior: "deny", message: "Session closed" });
    }
    this.askResolvers.clear();
    this.info.status = "exited";
    this.info.pendingAsk = null;
    this.hooks.onChanged();
  }

  resize() {
    /* n/a */
  }

  private pushUserEvent(text: string) {
    this.pushEvent({ kind: "user", text, ts: Date.now() });
  }

  private pushEvent(e: ChatEvent) {
    this.events.push(e);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    this.buffer.append(chatEventToText(e));
    this.hooks.onEvent(e);
  }

  private fail(message: string) {
    this.info.status = "error";
    this.info.preview = message;
    this.pushEvent({ kind: "error", text: message, ts: Date.now() });
    this.hooks.onChanged();
    this.hooks.onError(message);
  }
}

function firstLine(s: string): string {
  return s.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) ?? "";
}

export function summarizeTool(name: string, input: any): string {
  if (!input) return "";
  switch (name) {
    case "Bash":
      return String(input.command ?? "").slice(0, 200);
    case "Edit":
    case "Write":
    case "Read":
      return String(input.file_path ?? input.path ?? "");
    case "Glob":
    case "Grep":
      return String(input.pattern ?? "");
    default: {
      const s = JSON.stringify(input);
      return s.length > 160 ? s.slice(0, 160) + "…" : s;
    }
  }
}

function chatEventToText(e: ChatEvent): string {
  switch (e.kind) {
    case "user":
      return `\n\x1b[36m› you:\x1b[0m ${e.text}\n`;
    case "assistant":
      return `\n\x1b[35m✦ claude:\x1b[0m ${e.text}\n`;
    case "tool":
      return `\x1b[90m  ⚙ ${e.name}: ${e.summary}\x1b[0m\n`;
    case "ask":
      return `\x1b[33m  ⏳ ${e.ask.title}\x1b[0m\n`;
    case "result":
      return `\x1b[32m✓ ${e.text}\x1b[0m\n`;
    case "info":
      return `\x1b[90m  ${e.text}\x1b[0m\n`;
    case "error":
      return `\x1b[31m✗ ${e.text}\x1b[0m\n`;
  }
}
