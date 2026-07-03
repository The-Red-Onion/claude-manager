import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import type { ConfigStore } from "../config.js";
import type { SessionManager } from "../sessions/manager.js";
import { DockerService } from "../docker.js";
import { registerWs } from "./ws.js";
import { listCliSessions, findCliSession } from "../claudeCliSessions.js";
import type { CreateSessionRequest, SessionInfo } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, "../../../web/dist");

export async function buildServer(
  manager: SessionManager,
  config: ConfigStore,
  docker: DockerService,
  onHandoff?: (info: SessionInfo) => void,
) {
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);

  // ---- Sessions ----
  app.get("/api/sessions", async () => ({ sessions: manager.list() }));

  app.post("/api/sessions", async (req, reply) => {
    const body = req.body as CreateSessionRequest;
    if (!body?.kind) return reply.code(400).send({ error: "kind required" });
    const info = manager.create(body);
    return { session: info };
  });

  app.get("/api/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const snap = manager.snapshot(id);
    if (!snap) return reply.code(404).send({ error: "not found" });
    return snap;
  });

  app.post("/api/sessions/:id/message", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { text } = (req.body as { text?: string }) ?? {};
    if (!text) return reply.code(400).send({ error: "text required" });
    return { ok: manager.sendMessage(id, text) };
  });

  app.post("/api/sessions/:id/rename", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name } = (req.body as { name?: string }) ?? {};
    if (!name?.trim()) return reply.code(400).send({ error: "name required" });
    return { ok: manager.rename(id, name) };
  });

  app.post("/api/sessions/:id/model", async (req) => {
    const { id } = req.params as { id: string };
    const { model } = (req.body as { model?: string }) ?? {};
    return { ok: manager.setModel(id, model ?? "") };
  });

  // ---- Handoff: adopt Claude CLI sessions started on this machine ----
  app.get("/api/claude-sessions", async (req) => {
    const limit = Number((req.query as { limit?: string })?.limit) || 12;
    return { sessions: listCliSessions(limit) };
  });

  app.post("/api/handoff", async (req, reply) => {
    const { cwd, sessionId } = (req.body as { cwd?: string; sessionId?: string }) ?? {};
    const cli = sessionId
      ? findCliSession(sessionId)
      : listCliSessions(1, cwd || undefined)[0];
    if (!cli) {
      return reply.code(404).send({
        error: cwd
          ? `no Claude CLI session found for ${cwd}`
          : "no Claude CLI session found",
      });
    }
    // Already adopted? Return the existing one instead of a duplicate.
    const existing = manager
      .list()
      .find((s) => s.resumeSessionId === cli.sessionId && s.status !== "exited");
    if (existing) return { session: existing, alreadyAdopted: true };

    const info = manager.create({
      kind: "claude",
      cwd: cli.cwd,
      name: pathBasename(cli.cwd),
      resumeSessionId: cli.sessionId,
    });
    onHandoff?.(info);
    return { session: info };
  });

  app.post("/api/sessions/:id/answer", async (req) => {
    const { id } = req.params as { id: string };
    const { askId, keys } = (req.body as { askId: string; keys: string[] }) ?? {};
    return { ok: manager.answerAsk(id, askId, keys ?? []) };
  });

  app.post("/api/sessions/:id/interrupt", async (req) => {
    const { id } = req.params as { id: string };
    return { ok: manager.interrupt(id) };
  });

  app.delete("/api/sessions/:id", async (req) => {
    const { id } = req.params as { id: string };
    return { ok: manager.kill(id) };
  });

  // ---- Docker ----
  app.get("/api/docker/status", async () => ({
    available: await docker.available(),
  }));
  app.get("/api/docker/containers", async () => ({
    containers: (await docker.available()) ? await docker.listContainers() : [],
  }));
  app.get("/api/docker/images", async () => ({
    images: (await docker.available()) ? await docker.listImages() : [],
  }));
  app.post("/api/docker/launch", async (req, reply) => {
    try {
      const id = await docker.launch(req.body as any);
      return { id };
    } catch (e: any) {
      return reply.code(400).send({ error: String(e?.message ?? e) });
    }
  });
  app.post("/api/docker/:id/start", async (req) => {
    await docker.start((req.params as any).id);
    return { ok: true };
  });
  app.post("/api/docker/:id/stop", async (req) => {
    await docker.stop((req.params as any).id);
    return { ok: true };
  });
  app.delete("/api/docker/:id", async (req) => {
    await docker.remove((req.params as any).id);
    return { ok: true };
  });

  // ---- Config ----
  app.get("/api/config", async () => {
    const c = config.get();
    // Never leak secrets to the client; report presence only.
    return {
      config: {
        ...c,
        telegram: { ...c.telegram, botToken: c.telegram.botToken ? "set" : "" },
        stt: { ...c.stt, apiKey: c.stt.apiKey ? "set" : "" },
      },
    };
  });
  app.put("/api/config", async (req) => {
    const patch = req.body as any;
    // If a masked secret comes back as "set", don't overwrite it.
    if (patch?.telegram?.botToken === "set") delete patch.telegram.botToken;
    if (patch?.stt?.apiKey === "set") delete patch.stt.apiKey;
    return { config: config.update(patch) };
  });

  // ---- Filesystem browse (for cwd picker) ----
  app.get("/api/fs/list", async (req) => {
    const dir = (req.query as { dir?: string })?.dir || os.homedir();
    try {
      const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => path.join(dir, e.name))
        .sort();
      return { dir, parent: path.dirname(dir), entries };
    } catch {
      return { dir, parent: path.dirname(dir), entries: [] };
    }
  });

  // ---- WebSocket ----
  registerWs(app, manager);

  // ---- Static web app (production) ----
  if (fs.existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/ws"))
        return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}

function pathBasename(p: string): string {
  return path.basename(p) || p;
}
