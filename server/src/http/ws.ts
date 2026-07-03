import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { SessionManager } from "../sessions/manager.js";

/**
 * One WS endpoint. Clients subscribe to a session (or the "lobby" for the
 * session list) and receive live output/events + status. Everything the web UI
 * and future clients need flows through here.
 */
export function registerWs(app: FastifyInstance, manager: SessionManager) {
  const clients = new Set<WebSocket>();
  // socket -> the session id it's attached to (for terminal streams)
  const attached = new Map<WebSocket, string>();

  function send(sock: WebSocket, msg: unknown) {
    if (sock.readyState === sock.OPEN) sock.send(JSON.stringify(msg));
  }

  function broadcast(msg: unknown) {
    const data = JSON.stringify(msg);
    for (const c of clients) if (c.readyState === c.OPEN) c.send(data);
  }

  function broadcastToAttached(sessionId: string, msg: unknown) {
    const data = JSON.stringify(msg);
    for (const [sock, id] of attached)
      if (id === sessionId && sock.readyState === sock.OPEN) sock.send(data);
  }

  // ---- Manager events → clients ----
  manager.on("sessions_changed", () =>
    broadcast({ type: "sessions", sessions: manager.list() }),
  );
  manager.on("output", (id: string, data: string) =>
    broadcastToAttached(id, { type: "output", id, data }),
  );
  manager.on("chat_event", (id: string, event) =>
    broadcastToAttached(id, { type: "chat_event", id, event }),
  );
  manager.on("ask", (id: string, ask) => broadcast({ type: "ask", id, ask }));
  manager.on("ask_resolved", (id: string, askId: string, answer: string) =>
    broadcast({ type: "ask_resolved", id, askId, answer }),
  );
  manager.on("done", (id: string, summary) =>
    broadcast({ type: "done", id, summary }),
  );
  manager.on("session_error", (id: string, message: string) =>
    broadcast({ type: "session_error", id, message }),
  );

  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);
    send(socket, { type: "sessions", sessions: manager.list() });

    socket.on("message", (raw: Buffer) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case "attach": {
          attached.set(socket, msg.id);
          const snap = manager.snapshot(msg.id);
          if (snap)
            send(socket, {
              type: "snapshot",
              id: msg.id,
              info: snap.info,
              buffer: snap.buffer,
              events: snap.events,
            });
          break;
        }
        case "detach":
          attached.delete(socket);
          break;
        case "input":
          manager.write(msg.id, msg.data);
          break;
        case "message":
          manager.sendMessage(msg.id, msg.text);
          break;
        case "answer":
          manager.answerAsk(msg.id, msg.askId, msg.keys ?? []);
          break;
        case "resize":
          manager.resize(msg.id, msg.cols, msg.rows);
          break;
        case "interrupt":
          manager.interrupt(msg.id);
          break;
      }
    });

    socket.on("close", () => {
      clients.delete(socket);
      attached.delete(socket);
    });
  });
}
