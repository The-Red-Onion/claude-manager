import { useSyncExternalStore } from "react";
import type { ChatEvent, PendingAsk, SessionInfo } from "./types.js";

type ServerMsg =
  | { type: "sessions"; sessions: SessionInfo[] }
  | { type: "snapshot"; id: string; info: SessionInfo; buffer: string; events: ChatEvent[] }
  | { type: "output"; id: string; data: string }
  | { type: "chat_event"; id: string; event: ChatEvent }
  | { type: "ask"; id: string; ask: PendingAsk }
  | { type: "ask_resolved"; id: string; askId: string; answer: string }
  | { type: "done"; id: string; summary: { text: string; isError: boolean } }
  | { type: "session_error"; id: string; message: string };

type Listener = (msg: ServerMsg) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private storeSubs = new Set<() => void>();
  sessions: SessionInfo[] = [];
  connected = false;
  private queue: object[] = [];

  connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => {
      this.connected = true;
      this.emitStore();
      for (const m of this.queue) this.ws!.send(JSON.stringify(m));
      this.queue = [];
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.emitStore();
      setTimeout(() => this.connect(), 1200);
    };
    this.ws.onmessage = (ev) => {
      const msg: ServerMsg = JSON.parse(ev.data);
      if (msg.type === "sessions") {
        this.sessions = msg.sessions;
        this.emitStore();
      }
      for (const l of this.listeners) l(msg);
    };
  }

  send(msg: object) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  on(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  // ---- store plumbing for useSyncExternalStore ----
  subscribe = (cb: () => void) => {
    this.storeSubs.add(cb);
    return () => this.storeSubs.delete(cb);
  };
  private emitStore() {
    for (const s of this.storeSubs) s();
  }
}

export const ws = new WsClient();
ws.connect();

export function useSessions(): SessionInfo[] {
  return useSyncExternalStore(ws.subscribe, () => ws.sessions);
}
export function useConnected(): boolean {
  return useSyncExternalStore(ws.subscribe, () => ws.connected);
}
export function useSession(id: string | undefined): SessionInfo | undefined {
  const sessions = useSessions();
  return id ? sessions.find((s) => s.id === id) : undefined;
}
export function usePendingAsks(): { session: SessionInfo; ask: PendingAsk }[] {
  const sessions = useSessions();
  return sessions
    .filter((s) => s.pendingAsk)
    .map((s) => ({ session: s, ask: s.pendingAsk! }));
}
