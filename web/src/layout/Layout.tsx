import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  TerminalSquare,
  Boxes,
  Settings as SettingsIcon,
  Flame,
  Send,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useConnected, usePendingAsks, useSessions } from "../lib/store.js";
import { SectionLabel, StatusDot } from "../ui/index.js";
import { cx } from "../ui/cx.js";
import { AskCard } from "../components/AskCard.js";

function NavItem({
  to,
  icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cx(
          "flex items-center gap-2.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "bg-brand-50 text-brand-700"
            : "text-ink-soft hover:bg-subtle",
        )
      }
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="min-w-5 h-5 px-1 grid place-items-center rounded-full bg-amber-500 text-white text-[11px] font-semibold">
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

export function Layout() {
  const sessions = useSessions();
  const connected = useConnected();
  const asks = usePendingAsks();
  const loc = useLocation();

  const active = sessions.filter((s) => s.status !== "exited").length;

  return (
    <div className="h-screen flex bg-canvas text-ink">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-line bg-surface flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-line">
          <div className="h-7 w-7 rounded-lg bg-brand-500 grid place-items-center">
            <Flame size={16} className="text-white" />
          </div>
          <span className="font-semibold tracking-tight">Claude Manager</span>
        </div>

        <nav className="p-3 space-y-1">
          <NavItem to="/" icon={<LayoutGrid size={17} />} label="Overview" />
          <NavItem
            to="/terminal"
            icon={<TerminalSquare size={17} />}
            label="Terminal"
          />
          <NavItem to="/containers" icon={<Boxes size={17} />} label="Containers" />
        </nav>

        <div className="px-3 pt-3 pb-1.5">
          <SectionLabel>Sessions</SectionLabel>
        </div>
        <div className="px-3 flex-1 overflow-y-auto space-y-0.5">
          {sessions.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-faint">None open</div>
          )}
          {sessions.map((s) => (
            <NavLink
              key={s.id}
              to={`/s/${s.id}`}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-2 h-8 px-2.5 rounded-lg text-[13px] transition-colors",
                  isActive ? "bg-subtle text-ink" : "text-ink-soft hover:bg-subtle",
                )
              }
            >
              <StatusDot status={s.status} pulse />
              <span className="flex-1 truncate">{s.name}</span>
              {s.pendingAsk && <span className="text-amber-500">⏳</span>}
            </NavLink>
          ))}
        </div>

        <div className="p-3 border-t border-line">
          <NavItem
            to="/settings"
            icon={<SettingsIcon size={17} />}
            label="Settings"
          />
          <div className="mt-2 px-3 flex items-center gap-1.5 text-[12px] text-muted">
            {connected ? (
              <>
                <Wifi size={13} className="text-ok" /> Connected · {active} active
              </>
            ) : (
              <>
                <WifiOff size={13} className="text-danger" /> Reconnecting…
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Attention banner: any session waiting on you (not on its own page) */}
        {asks.length > 0 && !loc.pathname.startsWith("/s/") && (
          <div className="border-b border-line bg-amber-50/50 p-3 space-y-2 max-h-[40vh] overflow-y-auto">
            {asks.map(({ session, ask }) => (
              <AskCard
                key={ask.id}
                ask={ask}
                sessionId={session.id}
                sessionName={session.name}
                compact
              />
            ))}
          </div>
        )}
        <main className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
