import { useState } from "react";
import { Plus, Sparkles, TerminalSquare, Boxes, LayoutGrid } from "lucide-react";
import { useSessions } from "../lib/store.js";
import { SessionCard } from "../components/SessionCard.js";
import { NewSessionModal } from "../components/NewSessionModal.js";
import { Button, Card, EmptyState } from "../ui/index.js";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import type { SessionKind } from "../lib/types.js";

export function Overview() {
  const sessions = useSessions();
  const [modal, setModal] = useState<null | SessionKind>(null);
  const nav = useNavigate();

  async function quickTerminal() {
    const { session } = await api.createSession({ kind: "shell" });
    nav(`/s/${session.id}`);
  }

  const live = sessions.filter((s) => s.status !== "exited");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <Button variant="primary" onClick={() => setModal("claude")}>
            <Plus size={16} /> New session
          </Button>
        </div>
        <p className="text-muted mb-8">
          Every Claude session, terminal, and container — in one place.
        </p>

        {/* Quick start row (Firecrawl-style) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          <QuickCard
            icon={<Sparkles size={18} />}
            title="Claude session"
            desc="Give it a task. Answer its prompts with a tap."
            onClick={() => setModal("claude")}
          />
          <QuickCard
            icon={<TerminalSquare size={18} />}
            title="Terminal"
            desc="A full interactive shell in the browser."
            onClick={quickTerminal}
          />
          <QuickCard
            icon={<Boxes size={18} />}
            title="Container"
            desc="Launch a Docker container and shell into it."
            onClick={() => nav("/containers")}
          />
        </div>

        <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          <LayoutGrid size={13} /> Sessions {live.length ? `· ${live.length}` : ""}
        </div>

        {sessions.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Sparkles size={28} />}
              title="No sessions yet"
              desc="Start a Claude session to kick off a task, or open a terminal."
              action={
                <Button variant="primary" onClick={() => setModal("claude")}>
                  <Plus size={16} /> New session
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </div>
        )}
      </div>

      <NewSessionModal
        open={modal !== null}
        defaultKind={modal ?? "claude"}
        onClose={() => setModal(null)}
      />
    </div>
  );
}

function QuickCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className="p-4 cursor-pointer hover:border-brand-200 hover:bg-brand-50/30 transition-colors"
    >
      <div className="text-brand-500 mb-2">{icon}</div>
      <div className="font-medium text-ink">{title}</div>
      <div className="text-[13px] text-muted mt-0.5">{desc}</div>
    </Card>
  );
}
