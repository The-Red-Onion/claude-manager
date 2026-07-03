import { Plus, TerminalSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSessions } from "../lib/store.js";
import { api } from "../lib/api.js";
import { Button, Card, EmptyState, StatusDot } from "../ui/index.js";

export function TerminalPage() {
  const sessions = useSessions().filter(
    (s) => s.kind === "shell" || s.kind === "docker",
  );
  const nav = useNavigate();

  async function newTerm() {
    const { session } = await api.createSession({ kind: "shell" });
    nav(`/s/${session.id}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">Terminal</h1>
          <Button variant="primary" onClick={newTerm}>
            <Plus size={16} /> New terminal
          </Button>
        </div>
        <p className="text-muted mb-8">
          Full interactive shells on your machine, streamed over the network.
        </p>

        {sessions.length === 0 ? (
          <Card>
            <EmptyState
              icon={<TerminalSquare size={28} />}
              title="No terminals open"
              desc="Open a shell to run commands remotely."
              action={
                <Button variant="primary" onClick={newTerm}>
                  <Plus size={16} /> New terminal
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <Card
                key={s.id}
                onClick={() => nav(`/s/${s.id}`)}
                className="p-3 flex items-center gap-3 cursor-pointer hover:border-line-strong"
              >
                <StatusDot status={s.status} pulse />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-[12px] text-faint font-mono truncate">
                    {s.cwd}
                  </div>
                </div>
                <span className="text-[12px] text-muted">{s.kind}</span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
