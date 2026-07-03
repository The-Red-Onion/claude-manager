import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ws } from "../lib/store.js";

/** Live xterm.js terminal wired to a session over the shared WS. */
export function Terminal({ sessionId }: { sessionId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new XTerm({
      fontFamily:
        '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      theme: {
        background: "#0c0c0d",
        foreground: "#e6e6e6",
        cursor: "#f5541d",
        selectionBackground: "#3a3a3a",
        black: "#0c0c0d",
        brightBlack: "#5a5a5a",
      },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current!);
    fit.fit();

    const doFit = () => {
      try {
        fit.fit();
        ws.send({ type: "resize", id: sessionId, cols: term.cols, rows: term.rows });
      } catch {
        /* noop */
      }
    };

    const off = ws.on((msg) => {
      if (msg.type === "snapshot" && msg.id === sessionId) {
        term.reset();
        term.write(msg.buffer);
      } else if (msg.type === "output" && msg.id === sessionId) {
        term.write(msg.data);
      } else if (msg.type === "chat_event" && msg.id === sessionId) {
        // claude sessions also render structured text into the buffer
      }
    });

    term.onData((data) => ws.send({ type: "input", id: sessionId, data }));

    ws.send({ type: "attach", id: sessionId });
    doFit();

    const ro = new ResizeObserver(doFit);
    ro.observe(hostRef.current!);
    window.addEventListener("resize", doFit);

    return () => {
      off();
      ro.disconnect();
      window.removeEventListener("resize", doFit);
      ws.send({ type: "detach", id: sessionId });
      term.dispose();
    };
  }, [sessionId]);

  return <div ref={hostRef} className="h-full w-full bg-[#0c0c0d] p-2" />;
}
