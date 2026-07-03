import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { AppConfig } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".claude-manager");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const DEFAULTS: AppConfig = {
  port: 8799,
  host: "0.0.0.0",
  telegram: {
    botToken: "",
    allowedUserIds: [],
    groupChatId: null,
    notifyChatId: null,
  },
  claude: {
    model: "",
    permissionMode: "default",
    effort: "",
    defaultCwd: os.homedir(),
  },
  stt: {
    provider: "",
    apiKey: "",
  },
  recentCwds: [],
};

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v === undefined) continue;
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      out[k] &&
      typeof out[k] === "object" &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v as any);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export class ConfigStore extends EventEmitter {
  private config: AppConfig;

  constructor() {
    super();
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      return deepMerge(DEFAULTS, JSON.parse(raw));
    } catch {
      return { ...DEFAULTS };
    }
  }

  get(): AppConfig {
    return this.config;
  }

  update(patch: Partial<AppConfig>): AppConfig {
    const prev = this.config;
    this.config = deepMerge(this.config, patch);
    this.persist();
    this.emit("change", this.config, prev);
    return this.config;
  }

  addRecentCwd(cwd: string) {
    const list = [cwd, ...this.config.recentCwds.filter((c) => c !== cwd)];
    this.update({ recentCwds: list.slice(0, 8) });
  }

  private persist() {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), {
      mode: 0o600,
    });
  }
}

export const configPath = CONFIG_PATH;
