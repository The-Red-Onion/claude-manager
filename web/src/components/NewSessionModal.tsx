import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, TerminalSquare } from "lucide-react";
import { api } from "../lib/api.js";
import { Button, Field, Input, Modal, Select, Textarea } from "../ui/index.js";
import { CwdPicker } from "./CwdPicker.js";
import { cx } from "../ui/cx.js";
import type { SessionKind } from "../lib/types.js";

export function NewSessionModal({
  open,
  onClose,
  defaultKind = "claude",
}: {
  open: boolean;
  onClose: () => void;
  defaultKind?: SessionKind;
}) {
  const nav = useNavigate();
  const [kind, setKind] = useState<SessionKind>(defaultKind);
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [permissionMode, setPermissionMode] = useState("default");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const { session } = await api.createSession({
        kind,
        name: name || undefined,
        cwd: cwd || undefined,
        prompt: kind === "claude" ? prompt || undefined : undefined,
        model: kind === "claude" ? model || undefined : undefined,
        effort: kind === "claude" ? effort || undefined : undefined,
        permissionMode: kind === "claude" ? permissionMode : undefined,
      });
      onClose();
      reset();
      nav(`/s/${session.id}`);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setName("");
    setPrompt("");
  }

  return (
    <Modal open={open} onClose={onClose} title="New session" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <KindTile
            active={kind === "claude"}
            onClick={() => setKind("claude")}
            icon={<Sparkles size={18} />}
            title="Claude session"
            desc="Structured agent with tappable prompts"
          />
          <KindTile
            active={kind === "shell"}
            onClick={() => setKind("shell")}
            icon={<TerminalSquare size={18} />}
            title="Terminal"
            desc="Full interactive shell"
          />
        </div>

        <Field label="Working directory">
          <CwdPicker value={cwd} onChange={setCwd} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" hint="Optional; auto-generated if blank">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-refactor"
            />
          </Field>
          {kind === "claude" && (
            <Field label="Model">
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">Default</option>
                <option value="opus">Opus</option>
                <option value="sonnet">Sonnet</option>
                <option value="haiku">Haiku</option>
              </Select>
            </Field>
          )}
        </div>

        {kind === "claude" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Permission mode">
                <Select
                  value={permissionMode}
                  onChange={(e) => setPermissionMode(e.target.value)}
                >
                  <option value="default">Default (ask via buttons)</option>
                  <option value="acceptEdits">Accept edits</option>
                  <option value="plan">Plan mode</option>
                  <option value="bypassPermissions">Bypass all (careful)</option>
                </Select>
              </Field>
              <Field label="Effort">
                <Select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                >
                  <option value="">Default</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="xhigh">X-High</option>
                  <option value="max">Max</option>
                </Select>
              </Field>
            </div>
            <Field label="First task" hint="What should Claude do?">
              <Textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Add a health check endpoint and write a test for it"
              />
            </Field>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} disabled={busy}>
            {busy ? "Starting…" : "Start session"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function KindTile({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "text-left p-3 rounded-xl border transition-colors",
        active
          ? "border-brand-400 bg-brand-50"
          : "border-line-strong hover:bg-subtle",
      )}
    >
      <div className={cx("mb-1", active ? "text-brand-600" : "text-ink-soft")}>
        {icon}
      </div>
      <div className="text-sm font-medium text-ink">{title}</div>
      <div className="text-[12px] text-muted">{desc}</div>
    </button>
  );
}
