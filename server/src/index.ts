import os from "node:os";
import { ConfigStore } from "./config.js";
import { SessionManager } from "./sessions/manager.js";
import { DockerService } from "./docker.js";
import { buildServer } from "./http/server.js";
import { TelegramBridge } from "./telegram/bot.js";

async function main() {
  const config = new ConfigStore();
  const manager = new SessionManager(config);
  const docker = new DockerService();

  const cfg = config.get();
  const port = Number(process.env.PORT) || cfg.port;

  // Telegram: uses configured public URL (if any) for the Mini App button.
  const publicUrl = process.env.PUBLIC_URL || "";
  const telegram = new TelegramBridge(manager, config, () => publicUrl);
  if (cfg.telegram.botToken) await telegram.start();

  const app = await buildServer(manager, config, docker, (info) =>
    void telegram.announceHandoff(info),
  );
  await app.listen({ port, host: cfg.host });

  const lan = localAddress();
  console.log("");
  console.log("  ┌─────────────────────────────────────────────┐");
  console.log("  │  Claude Manager is running                  │");
  console.log("  └─────────────────────────────────────────────┘");
  console.log(`   local:   http://localhost:${port}`);
  if (lan) console.log(`   network: http://${lan}:${port}`);
  console.log(
    `   telegram: ${cfg.telegram.botToken ? "configured" : "not set (add token in Settings)"}`,
  );
  console.log("");

  const shutdown = () => {
    console.log("\nShutting down…");
    manager.killAll();
    telegram.stop();
    app.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function localAddress(): string | null {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
