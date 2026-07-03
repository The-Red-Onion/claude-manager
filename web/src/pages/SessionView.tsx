import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Send, Square, Trash2, ArrowLeft, Pencil } from "lucide-react";
import { useSession } from "../lib/store.js";
import { ws } from "../lib/store.js";
import { api } from "../lib/api.js";
import { ChatFeed } from "../components/ChatFeed.js";
import { Terminal } from "../components/Terminal.js";
import { Button, StatusDot, STATUS_TEXT, Badge } from "../ui/index.js";

export function SessionView() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const s = useSession(id);
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, [id]);

  if (!s) {
    return (
      <div className="h-full grid place-items-center text-muted">
        <div className="text-center">
          <div>Session not found or closed.</div>
          <Button className="mt-3" onClick={() => nav("/")}>
            <ArrowLeft size={15} /> Back to overview
          </Button>
        </div>
      </div>
    );
  }

  const isClaude = s.kind === "claude";

  function send() {
    const t = text.trim();
    if (!t) return;
    ws.send({ type: "message", id, text: t });
    setText("");
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="h-14 shrink-0 border-b border-line bg-surface flex items-center gap-3 px-4">
        <button
          onClick={() => nav("/")}
          className="text-muted hover:text-ink lg:hidden"
        >
          <ArrowLeft size={18} />
        </button>
        <StatusDot status={s.status} pulse />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="font-semibold truncate leading-tight">{s.name}</div>
            <button
              className="shrink-0 text-faint hover:text-ink"
              title="Rename session"
              onClick={() => {
                const name = window.prompt("Rename session", s.name);
                if (name?.trim()) void api.renameSession(id, name.trim());
              }}
            >
              <Pencil size={13} />
            </button>
          </div>
          <div className="text-[12px] text-faint font-mono truncate">
            {s.cwd}
          </div>
        </div>
        <div className="ml-2 flex items-center gap-1.5">
          <Badge tone="neutral">{s.kind}</Badge>
          {s.model && <Badge tone="brand">{s.model}</Badge>}
          <span className="text-[12px] text-muted hidden sm:inline">
            {STATUS_TEXT[s.status]}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {s.stats.costUsd != null && (
            <span className="text-[12px] text-muted font-mono hidden md:inline">
              ${s.stats.costUsd.toFixed(3)} · {s.stats.turns ?? 0} turns
            </span>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => api.interrupt(id)}
            title="Interrupt"
          >
            <Square size={14} /> Interrupt
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              api.killSession(id);
              nav("/");
            }}
            title="Close session"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {isClaude ? (
          <ChatFeed sessionId={id} sessionName={s.name} />
        ) : (
          <Terminal sessionId={id} />
        )}
      </div>

      {/* Composer (Claude only) */}
      {isClaude && (
        <div className="shrink-0 border-t border-line bg-surface p-3">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={`Send a task to ${s.name}…  (Enter to send, Shift+Enter for newline)`}
              className="flex-1 max-h-40 min-h-9 px-3 py-2 rounded-xl bg-subtle border border-line-strong text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-400"
            />
            <Button variant="primary" onClick={send} disabled={!text.trim()}>
              <Send size={15} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
