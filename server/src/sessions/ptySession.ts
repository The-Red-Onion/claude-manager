import { spawn, type IPty } from "node-pty";
import os from "node:os";
import { RingBuffer } from "./ringBuffer.js";
import type { ChatEvent, SessionInfo } from "../types.js";
import type { Session } from "./session.js";

export interface PtySessionHooks {
  onOutput: (data: string) => void;
  onChanged: () => void;
  onDone: (summary: { text: string; isError: boolean }) => void;
}

const IDLE_AFTER_MS = 2500;

/** A real terminal: login shell or `docker exec` into a container. */
export class PtySession implements Session {
  readonly buffer = new RingBuffer();
  readonly events: ChatEvent[] = [];
  private pty: IPty;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly info: SessionInfo,
    private hooks: PtySessionHooks,
  ) {
    const env = { ...process.env, TERM: "xterm-256color" } as Record<
      string,
      string
    >;

    if (info.kind === "docker" && info.containerId) {
      this.pty = spawn(
        "docker",
        [
          "exec",
          "-it",
          info.containerId,
          "sh",
          "-c",
          "command -v bash >/dev/null 2>&1 && exec bash || exec sh",
        ],
        { name: "xterm-256color", cols: 120, rows: 32, cwd: info.cwd, env },
      );
    } else {
      const shell = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "/bin/zsh");
      this.pty = spawn(shell, ["-l"], {
        name: "xterm-256color",
        cols: 120,
        rows: 32,
        cwd: info.cwd,
        env,
      });
    }

    this.info.status = "idle";

    this.pty.onData((data) => {
      this.buffer.append(data);
      this.info.lastActivityAt = Date.now();
      this.setWorking();
      this.hooks.onOutput(data);
    });

    this.pty.onExit(({ exitCode }) => {
      this.info.status = "exited";
      this.info.exitCode = exitCode;
      this.info.preview = `exited (${exitCode})`;
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.hooks.onChanged();
      this.hooks.onDone({
        text: this.buffer.tail(500) || `Process exited with code ${exitCode}`,
        isError: exitCode !== 0,
      });
    });
  }

  private setWorking() {
    if (this.info.status === "exited") return;
    if (this.info.status !== "working") {
      this.info.status = "working";
      this.hooks.onChanged();
    }
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.info.status === "working") {
        this.info.status = "idle";
        this.info.preview = lastLine(this.buffer.tail(300));
        this.hooks.onChanged();
      }
    }, IDLE_AFTER_MS);
  }

  write(data: string) {
    this.pty.write(data);
  }

  sendMessage(text: string) {
    this.pty.write(text + "\r");
  }

  answerAsk(): boolean {
    return false;
  }

  setModel() {
    /* n/a for shells */
  }

  interrupt() {
    this.pty.write("\x03"); // Ctrl+C
  }

  kill() {
    try {
      this.pty.kill();
    } catch {
      /* already dead */
    }
  }

  resize(cols: number, rows: number) {
    try {
      this.pty.resize(Math.max(2, cols), Math.max(2, rows));
    } catch {
      /* exited */
    }
  }
}

function lastLine(s: string): string {
  const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1]?.slice(0, 120) ?? "";
}
