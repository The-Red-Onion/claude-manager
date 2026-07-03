import { Link } from "react-router-dom";
import { Sparkles, TerminalSquare, Boxes } from "lucide-react";
import type { SessionInfo } from "../lib/types.js";
import { Card, StatusDot, STATUS_TEXT } from "../ui/index.js";

const KIND_ICON = {
  claude: Sparkles,
  shell: TerminalSquare,
  docker: Boxes,
} as const;

export function SessionCard({ s }: { s: SessionInfo }) {
  const Icon = KIND_ICON[s.kind];
  return (
    <Link to={`/s/${s.id}`}>
      <Card className="p-4 hover:border-line-strong transition-colors h-full flex flex-col group">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-subtle grid place-items-center shrink-0 group-hover:bg-brand-50">
              <Icon size={16} className="text-ink-soft group-hover:text-brand-600" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-ink truncate">{s.name}</div>
              <div className="text-[12px] text-faint font-mono truncate">
                {s.cwd.replace(/^\/Users\/[^/]+/, "~")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusDot status={s.status} pulse />
          </div>
        </div>

        <div className="mt-3 flex-1">
          {s.pendingAsk ? (
            <div className="text-[13px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 border border-amber-100">
              ⏳ {s.pendingAsk.title}
            </div>
          ) : (
            <div className="text-[13px] text-muted line-clamp-2 min-h-[2.4em]">
              {s.preview || "—"}
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-line flex items-center justify-between text-[12px] text-muted">
          <span>{STATUS_TEXT[s.status]}</span>
          {s.stats.costUsd != null && (
            <span className="font-mono">${s.stats.costUsd.toFixed(3)}</span>
          )}
        </div>
      </Card>
    </Link>
  );
}
