import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Play, Square, Trash2, Plus, TerminalSquare } from "lucide-react";
import { api } from "../lib/api.js";
import type { ContainerSummary } from "../lib/types.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Textarea,
} from "../ui/index.js";

export function Containers() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [launch, setLaunch] = useState(false);
  const nav = useNavigate();

  async function refresh() {
    const { available } = await api.dockerStatus();
    setAvailable(available);
    if (available) setContainers((await api.containers()).containers);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  async function shellInto(c: ContainerSummary) {
    const { session } = await api.createSession({
      kind: "docker",
      name: c.name,
      containerId: c.id,
      containerName: c.name,
    });
    nav(`/s/${session.id}`);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">Containers</h1>
          {available && (
            <Button variant="primary" onClick={() => setLaunch(true)}>
              <Plus size={16} /> Launch
            </Button>
          )}
        </div>
        <p className="text-muted mb-8">
          Launch, control, and shell into Docker containers.
        </p>

        {available === false && (
          <Card>
            <EmptyState
              icon={<Boxes size={28} />}
              title="Docker isn't reachable"
              desc="Start Docker Desktop (or the daemon) and this page will light up."
            />
          </Card>
        )}

        {available && containers.length === 0 && (
          <Card>
            <EmptyState
              icon={<Boxes size={28} />}
              title="No containers"
              desc="Launch one to get started."
              action={
                <Button variant="primary" onClick={() => setLaunch(true)}>
                  <Plus size={16} /> Launch container
                </Button>
              }
            />
          </Card>
        )}

        <div className="space-y-2">
          {containers.map((c) => (
            <Card key={c.id} className="p-3 flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  c.state === "running" ? "bg-green-500" : "bg-neutral-400"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{c.name}</span>
                  <Badge tone={c.state === "running" ? "ok" : "neutral"}>
                    {c.state}
                  </Badge>
                </div>
                <div className="text-[12px] text-faint font-mono truncate">
                  {c.image}
                  {c.ports.filter((p) => p.public).length > 0 &&
                    " · " +
                      c.ports
                        .filter((p) => p.public)
                        .map((p) => `${p.public}→${p.private}`)
                        .join(", ")}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {c.state === "running" ? (
                  <>
                    <Button size="sm" onClick={() => shellInto(c)}>
                      <TerminalSquare size={14} /> Shell
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => api.stopContainer(c.id).then(refresh)}
                    >
                      <Square size={14} />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => api.startContainer(c.id).then(refresh)}
                  >
                    <Play size={14} /> Start
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => api.removeContainer(c.id).then(refresh)}
                >
                  <Trash2 size={14} className="text-danger" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <LaunchModal
        open={launch}
        onClose={() => {
          setLaunch(false);
          refresh();
        }}
      />
    </div>
  );
}

function LaunchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [ports, setPorts] = useState("");
  const [volumes, setVolumes] = useState("");
  const [cmd, setCmd] = useState("");
  const [env, setEnv] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    setBusy(true);
    setErr("");
    try {
      await api.launch({ image, name, ports, volumes, cmd, env });
      onClose();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Launch container" wide>
      <div className="space-y-3">
        <Field label="Image" hint="Pulled if not present locally">
          <Input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="nginx:latest"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Ports" hint="host:container, comma-separated">
            <Input value={ports} onChange={(e) => setPorts(e.target.value)} placeholder="8080:80" />
          </Field>
        </div>
        <Field label="Volumes" hint="/host:/container, comma-separated">
          <Input value={volumes} onChange={(e) => setVolumes(e.target.value)} placeholder="optional" />
        </Field>
        <Field label="Command" hint="Override default (optional)">
          <Input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="optional" />
        </Field>
        <Field label="Env" hint="KEY=VALUE per line">
          <Textarea rows={2} value={env} onChange={(e) => setEnv(e.target.value)} placeholder="optional" />
        </Field>
        {err && <div className="text-[13px] text-danger">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go} disabled={!image || busy}>
            {busy ? "Launching…" : "Launch"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
