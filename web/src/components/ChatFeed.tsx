import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatEvent } from "../lib/types.js";
import { ws } from "../lib/store.js";
import { AskCard } from "./AskCard.js";
import { cx } from "../ui/cx.js";

/** Structured transcript for Claude sessions. */
export function ChatFeed({
  sessionId,
  sessionName,
}: {
  sessionId: string;
  sessionName: string;
}) {
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEvents([]);
    const off = ws.on((msg) => {
      if (msg.type === "snapshot" && msg.id === sessionId) {
        setEvents(msg.events ?? []);
      } else if (msg.type === "chat_event" && msg.id === sessionId) {
        setEvents((prev) => [...prev, msg.event]);
      } else if (msg.type === "ask_resolved" && msg.id === sessionId) {
        setEvents((prev) =>
          prev.map((e) =>
            e.kind === "ask" && e.ask.id === msg.askId
              ? { ...e, answered: msg.answer }
              : e,
          ),
        );
      }
    });
    ws.send({ type: "attach", id: sessionId });
    return () => {
      off();
      ws.send({ type: "detach", id: sessionId });
    };
  }, [sessionId]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  return (
    <div ref={scroller} className="h-full overflow-y-auto px-4 py-4 space-y-3">
      {events.map((e, i) => (
        <FeedRow
          key={i}
          e={e}
          sessionId={sessionId}
          sessionName={sessionName}
        />
      ))}
    </div>
  );
}

function FeedRow({
  e,
  sessionId,
  sessionName,
}: {
  e: ChatEvent;
  sessionId: string;
  sessionName: string;
}) {
  switch (e.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-500 text-white px-3.5 py-2 text-sm whitespace-pre-wrap">
            {e.text}
          </div>
        </div>
      );
    case "assistant":
      return (
        <div className="max-w-[85%] text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
          {e.text}
        </div>
      );
    case "tool":
      return (
        <div className="flex items-center gap-2 text-[12px] text-muted font-mono">
          <span className="text-brand-500">⚙</span>
          <span className="font-medium text-ink-soft">{e.name}</span>
          <span className="truncate">{e.summary}</span>
        </div>
      );
    case "ask":
      return e.answered ? (
        <div className="text-[13px] text-muted">
          {e.ask.type === "permission" ? "🔐" : "❓"} {e.ask.title} →{" "}
          <span className="text-ink-soft">{e.answered}</span>
        </div>
      ) : (
        <AskCard ask={e.ask} sessionId={sessionId} sessionName={sessionName} />
      );
    case "result":
      return (
        <div
          className={cx(
            "text-[13px] rounded-lg px-3 py-2 border",
            e.isError
              ? "bg-red-50 border-red-100 text-red-700"
              : "bg-green-50 border-green-100 text-green-800",
          )}
        >
          {e.isError ? "✗" : "✓"} {e.text}
          {e.stats.costUsd != null && (
            <span className="text-muted">
              {" "}
              · ${e.stats.costUsd.toFixed(3)} · {e.stats.turns ?? 0} turns
            </span>
          )}
        </div>
      );
    case "info":
      return <div className="text-[12px] text-faint">{e.text}</div>;
    case "error":
      return <div className="text-[13px] text-red-600">✗ {e.text}</div>;
  }
}
