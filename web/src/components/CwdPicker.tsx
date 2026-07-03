import { useEffect, useState } from "react";
import { ChevronUp, Folder } from "lucide-react";
import { api } from "../lib/api.js";

/** Minimal directory browser for choosing a session's working dir. */
export function CwdPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (dir: string) => void;
}) {
  const [dir, setDir] = useState(value);
  const [parent, setParent] = useState("");
  const [entries, setEntries] = useState<string[]>([]);

  useEffect(() => {
    api
      .browse(dir)
      .then((r) => {
        setEntries(r.entries);
        setParent(r.parent);
        setDir(r.dir);
        onChange(r.dir);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  return (
    <div className="border border-line-strong rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-9 bg-subtle border-b border-line">
        <Folder size={14} className="text-brand-500 shrink-0" />
        <span className="text-[13px] font-mono truncate text-ink-soft">
          {dir}
        </span>
      </div>
      <div className="max-h-44 overflow-y-auto">
        {parent && parent !== dir && (
          <button
            onClick={() => setDir(parent)}
            className="w-full flex items-center gap-2 px-3 h-8 text-[13px] text-muted hover:bg-subtle"
          >
            <ChevronUp size={14} /> ..
          </button>
        )}
        {entries.map((e) => (
          <button
            key={e}
            onClick={() => setDir(e)}
            className="w-full flex items-center gap-2 px-3 h-8 text-[13px] text-ink-soft hover:bg-subtle text-left"
          >
            <Folder size={13} className="text-faint shrink-0" />
            <span className="truncate">{e.split("/").pop()}</span>
          </button>
        ))}
        {entries.length === 0 && (
          <div className="px-3 py-2 text-[13px] text-faint">
            No subfolders
          </div>
        )}
      </div>
    </div>
  );
}
