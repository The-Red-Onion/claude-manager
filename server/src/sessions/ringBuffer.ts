/** Bounded text buffer for terminal scrollback / transcript snapshots. */
export class RingBuffer {
  private chunks: string[] = [];
  private size = 0;

  constructor(private readonly cap = 300_000) {}

  append(data: string) {
    this.chunks.push(data);
    this.size += data.length;
    while (this.size > this.cap && this.chunks.length > 1) {
      const removed = this.chunks.shift()!;
      this.size -= removed.length;
    }
  }

  snapshot(): string {
    return this.chunks.join("");
  }

  /** Last N characters, ANSI stripped — for previews and Telegram. */
  tail(n = 600): string {
    return stripAnsi(this.snapshot()).trimEnd().slice(-n);
  }
}

// Covers CSI/OSC escape sequences well enough for previews.
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /[][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}
