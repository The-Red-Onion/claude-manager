// node-pty ships prebuilt `spawn-helper` binaries. Some package managers
// (notably pnpm) extract them without the executable bit, which makes every
// pty spawn fail with "posix_spawnp failed". Re-add +x after install.
import { readdirSync, statSync, chmodSync } from "node:fs";
import { join } from "node:path";

function walk(dir, hits) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, hits);
    else if (e.name === "spawn-helper") hits.push(p);
  }
}

const roots = [
  join(process.cwd(), "node_modules"),
  join(process.cwd(), "..", "node_modules"),
];
const hits = [];
for (const r of roots) walk(r, hits);
let fixed = 0;
for (const f of hits) {
  try {
    const mode = statSync(f).mode;
    if (!(mode & 0o111)) {
      chmodSync(f, mode | 0o755);
      fixed++;
    }
  } catch {
    /* ignore */
  }
}
if (fixed) console.log(`[fix-pty] made ${fixed} spawn-helper binary(ies) executable`);
