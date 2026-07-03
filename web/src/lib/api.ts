import type {
  AppConfig,
  ContainerSummary,
  SessionInfo,
} from "./types.js";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}

export const api = {
  sessions: () =>
    fetch("/api/sessions").then(j<{ sessions: SessionInfo[] }>),
  createSession: (body: Record<string, unknown>) =>
    fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ session: SessionInfo }>),
  killSession: (id: string) =>
    fetch(`/api/sessions/${id}`, { method: "DELETE" }).then(j),
  renameSession: (id: string, name: string) =>
    fetch(`/api/sessions/${id}/rename`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(j),
  setSessionModel: (id: string, model: string) =>
    fetch(`/api/sessions/${id}/model`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model }),
    }).then(j),
  interrupt: (id: string) =>
    fetch(`/api/sessions/${id}/interrupt`, { method: "POST" }).then(j),

  dockerStatus: () =>
    fetch("/api/docker/status").then(j<{ available: boolean }>),
  containers: () =>
    fetch("/api/docker/containers").then(j<{ containers: ContainerSummary[] }>),
  images: () =>
    fetch("/api/docker/images").then(
      j<{ images: { id: string; tags: string[]; size: number }[] }>,
    ),
  launch: (body: Record<string, unknown>) =>
    fetch("/api/docker/launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(j<{ id: string }>),
  startContainer: (id: string) =>
    fetch(`/api/docker/${id}/start`, { method: "POST" }).then(j),
  stopContainer: (id: string) =>
    fetch(`/api/docker/${id}/stop`, { method: "POST" }).then(j),
  removeContainer: (id: string) =>
    fetch(`/api/docker/${id}`, { method: "DELETE" }).then(j),

  getConfig: () => fetch("/api/config").then(j<{ config: AppConfig }>),
  putConfig: (patch: Record<string, unknown>) =>
    fetch("/api/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<{ config: AppConfig }>),

  browse: (dir?: string) =>
    fetch(`/api/fs/list${dir ? `?dir=${encodeURIComponent(dir)}` : ""}`).then(
      j<{ dir: string; parent: string; entries: string[] }>,
    ),
};
