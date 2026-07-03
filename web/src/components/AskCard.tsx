import { useState } from "react";
import type { PendingAsk } from "../lib/types.js";
import { ws } from "../lib/store.js";
import { Button } from "../ui/index.js";
import { cx } from "../ui/cx.js";

/** Renders Claude's permission / choice prompt as tappable buttons. */
export function AskCard({
  ask,
  sessionId,
  sessionName,
  compact,
}: {
  ask: PendingAsk;
  sessionId: string;
  sessionName?: string;
  compact?: boolean;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  function answer(keys: string[]) {
    ws.send({ type: "answer", id: sessionId, askId: ask.id, keys });
    setSent(true);
  }

  const isPermission = ask.type === "permission";

  return (
    <div
      className={cx(
        "rounded-xl border border-amber-200 bg-amber-50/70 overflow-hidden",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span>{isPermission ? "🔐" : "❓"}</span>
        {sessionName && (
          <span className="text-[13px] font-medium text-amber-800">
            {sessionName}
          </span>
        )}
        <span className="text-[11px] uppercase tracking-wide text-amber-600 font-semibold">
          {isPermission ? "Permission" : "Question"}
        </span>
      </div>
      <div className="text-sm font-medium text-ink">{ask.title}</div>
      {ask.detail && (
        <pre className="mt-2 text-[12px] text-ink-soft bg-white/70 border border-amber-100 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-32">
          {ask.detail}
        </pre>
      )}

      {sent ? (
        <div className="mt-3 text-sm text-amber-700">✓ Answer sent</div>
      ) : ask.multiSelect ? (
        <div className="mt-3 space-y-2">
          {ask.options.map((o) => {
            const on = picked.includes(o.key);
            return (
              <button
                key={o.key}
                onClick={() =>
                  setPicked((p) =>
                    on ? p.filter((k) => k !== o.key) : [...p, o.key],
                  )
                }
                className={cx(
                  "w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                  on
                    ? "border-brand-400 bg-brand-50 text-brand-800"
                    : "border-line-strong bg-surface hover:bg-subtle",
                )}
              >
                <span className="mr-2">{on ? "☑" : "☐"}</span>
                {o.label}
                {o.description && (
                  <span className="block text-[12px] text-muted mt-0.5">
                    {o.description}
                  </span>
                )}
              </button>
            );
          })}
          <Button
            variant="primary"
            size="sm"
            disabled={!picked.length}
            onClick={() => answer(picked)}
          >
            Submit {picked.length ? `(${picked.length})` : ""}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {ask.options.map((o) => (
            <Button
              key={o.key}
              size="sm"
              variant={
                o.key === "deny"
                  ? "danger"
                  : o.key === "allow" || o.key === "allow_always"
                    ? "secondary"
                    : "primary"
              }
              onClick={() => answer([o.key])}
              title={o.description}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
