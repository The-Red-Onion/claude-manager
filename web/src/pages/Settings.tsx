import { useEffect, useState } from "react";
import { Check, Send } from "lucide-react";
import { api } from "../lib/api.js";
import type { AppConfig } from "../lib/types.js";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  SectionLabel,
} from "../ui/index.js";
import { CwdPicker } from "../components/CwdPicker.js";

export function Settings() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [token, setToken] = useState("");
  const [sttKey, setSttKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getConfig().then((r) => setCfg(r.config));
  }, []);

  if (!cfg) return <div className="p-8 text-muted">Loading…</div>;

  async function save(patch: Record<string, unknown>) {
    const r = await api.putConfig(patch);
    setCfg(r.config);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const tokenSet = cfg.telegram.botToken === "set";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted">Configure Claude defaults and the Telegram remote.</p>
        </div>

        {/* Claude defaults */}
        <Card className="p-5 space-y-4">
          <SectionLabel>Claude defaults</SectionLabel>
          <Field label="Default model">
            <Select
              value={cfg.claude.model}
              onChange={(e) =>
                save({ claude: { ...cfg.claude, model: e.target.value } })
              }
            >
              <option value="">CLI default</option>
              <option value="opus">Opus</option>
              <option value="sonnet">Sonnet</option>
              <option value="haiku">Haiku</option>
            </Select>
          </Field>
          <Field label="Default permission mode">
            <Select
              value={cfg.claude.permissionMode}
              onChange={(e) =>
                save({
                  claude: { ...cfg.claude, permissionMode: e.target.value },
                })
              }
            >
              <option value="default">Default (ask via buttons)</option>
              <option value="acceptEdits">Accept edits</option>
              <option value="plan">Plan mode</option>
              <option value="bypassPermissions">Bypass all</option>
            </Select>
          </Field>
          <Field label="Default reasoning effort">
            <Select
              value={cfg.claude.effort}
              onChange={(e) =>
                save({ claude: { ...cfg.claude, effort: e.target.value } })
              }
            >
              <option value="">Default</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">X-High</option>
              <option value="max">Max</option>
            </Select>
          </Field>
          <Field label="Default working directory">
            <CwdPicker
              value={cfg.claude.defaultCwd}
              onChange={(dir) =>
                setCfg({ ...cfg, claude: { ...cfg.claude, defaultCwd: dir } })
              }
            />
            <div className="mt-2">
              <Button
                size="sm"
                onClick={() => save({ claude: cfg.claude })}
              >
                Save directory
              </Button>
            </div>
          </Field>
        </Card>

        {/* Telegram */}
        <Card className="p-5 space-y-4">
          <SectionLabel>Telegram remote</SectionLabel>
          <p className="text-[13px] text-muted -mt-2">
            Create a bot with{" "}
            <a
              className="text-brand-600 hover:underline"
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
            >
              @BotFather
            </a>
            , paste the token, then send <code>/start</code> to your bot. The
            first person to <code>/start</code> is authorized.
          </p>
          <Field label="Bot token">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={tokenSet ? "•••••••• (set)" : "123456:ABC-DEF…"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Button
                variant="primary"
                onClick={() => {
                  save({
                    telegram: { ...cfg.telegram, botToken: token },
                  });
                  setToken("");
                }}
                disabled={!token}
              >
                <Send size={15} /> Save
              </Button>
            </div>
          </Field>
          <div className="text-[13px] text-muted">
            Status:{" "}
            {tokenSet ? (
              <span className="text-ok font-medium">
                token set · restart server to (re)connect
              </span>
            ) : (
              <span className="text-faint">not configured</span>
            )}
            {cfg.telegram.allowedUserIds.length > 0 && (
              <span> · authorized user #{cfg.telegram.allowedUserIds[0]}</span>
            )}
          </div>
        </Card>

        {/* Voice transcription (Telegram voice messages) */}
        <Card className="p-5 space-y-4">
          <SectionLabel>Voice transcription</SectionLabel>
          <p className="text-[13px] text-muted -mt-2">
            Lets the Telegram bot understand voice messages. Uses a
            Whisper-compatible API — OpenAI or Groq (Groq has a generous free
            tier).
          </p>
          <Field label="Provider">
            <Select
              value={cfg.stt.provider}
              onChange={(e) =>
                save({ stt: { ...cfg.stt, provider: e.target.value } })
              }
            >
              <option value="">Off</option>
              <option value="openai">OpenAI (whisper-1)</option>
              <option value="groq">Groq (whisper-large-v3)</option>
            </Select>
          </Field>
          <Field label="API key">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={cfg.stt.apiKey === "set" ? "•••••••• (set)" : "sk-…"}
                value={sttKey}
                onChange={(e) => setSttKey(e.target.value)}
              />
              <Button
                variant="primary"
                onClick={() => {
                  save({ stt: { ...cfg.stt, apiKey: sttKey } });
                  setSttKey("");
                }}
                disabled={!sttKey}
              >
                <Send size={15} /> Save
              </Button>
            </div>
          </Field>
        </Card>

        <div className="h-8 flex items-center text-[13px] text-ok">
          {saved && (
            <span className="flex items-center gap-1">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
