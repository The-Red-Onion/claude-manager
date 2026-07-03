import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Discovery of Claude CLI sessions on this machine (~/.claude/projects).
 * Used for "handoff": start a session on the laptop terminal, then adopt it
 * in Claude Manager and keep going from Telegram / the web UI.
 */

export interface CliSession {
  sessionId: string;
  cwd: string;
  mtime: number;
  preview: string;
}

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Most recent CLI sessions, newest first. Optionally filter by cwd. */
export function listCliSessions(limit = 10, cwdFilter?: string): CliSession[] {
  let dirs: string[] = [];
  try {
    dirs = fs
      .readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(PROJECTS_DIR, e.name));
  } catch {
    return [];
  }

  const files: { file: string; mtime: number }[] = [];
  for (const dir of dirs) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".jsonl")) continue;
      if (!UUID_RE.test(e.name.slice(0, -6))) continue;
      const full = path.join(dir, e.name);
      try {
        files.push({ file: full, mtime: fs.statSync(full).mtimeMs });
      } catch {
        /* ignore */
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);

  const out: CliSession[] = [];
  for (const f of files) {
    if (out.length >= limit) break;
    const meta = readMeta(f.file);
    if (!meta) continue;
    if (cwdFilter && meta.cwd !== cwdFilter) continue;
    out.push({
      sessionId: path.basename(f.file, ".jsonl"),
      cwd: meta.cwd,
      mtime: f.mtime,
      preview: meta.preview,
    });
  }
  return out;
}

/** Look up one CLI session by its UUID. */
export function findCliSession(sessionId: string): CliSession | null {
  if (!UUID_RE.test(sessionId)) return null;
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(PROJECTS_DIR).map((d) => path.join(PROJECTS_DIR, d));
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const file = path.join(dir, `${sessionId}.jsonl`);
    try {
      const stat = fs.statSync(file);
      const meta = readMeta(file);
      if (!meta) return null;
      return { sessionId, cwd: meta.cwd, mtime: stat.mtimeMs, preview: meta.preview };
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** Read cwd + a short preview from the head of a session transcript. */
function readMeta(file: string): { cwd: string; preview: string } | null {
  let fd: number;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(131072);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const lines = buf.toString("utf8", 0, n).split("\n");
    let cwd = "";
    let preview = "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // truncated tail of the read window
      }
      if (!cwd && typeof obj.cwd === "string") cwd = obj.cwd;
      if (!preview && obj.type === "user") {
        const c = obj.message?.content;
        const text =
          typeof c === "string"
            ? c
            : Array.isArray(c)
              ? (c.find((b: any) => b?.type === "text")?.text ?? "")
              : "";
        preview =
          String(text)
            .split("\n")
            .map((l: string) => l.trim())
            .find(Boolean)
            ?.slice(0, 80) ?? "";
      }
      if (cwd && preview) break;
    }
    return cwd ? { cwd, preview } : null;
  } finally {
    fs.closeSync(fd);
  }
}
