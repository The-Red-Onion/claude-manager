/**
 * Speech-to-text for Telegram voice messages via an OpenAI-compatible
 * Whisper endpoint (OpenAI or Groq). Key + provider live in config.stt.
 */

const PROVIDERS: Record<string, { base: string; model: string }> = {
  openai: { base: "https://api.openai.com/v1", model: "whisper-1" },
  groq: { base: "https://api.groq.com/openai/v1", model: "whisper-large-v3" },
};

export async function transcribe(
  audio: ArrayBuffer,
  filePath: string,
  cfg: { provider: string; apiKey: string },
): Promise<string> {
  const provider = PROVIDERS[cfg.provider] ?? PROVIDERS.openai;
  let name = filePath.split("/").pop() || "voice.ogg";
  if (!/\.[a-z0-9]{2,4}$/i.test(name)) name += ".ogg";

  const form = new FormData();
  form.append("file", new Blob([audio]), name);
  form.append("model", provider.model);

  const res = await fetch(`${provider.base}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`STT ${res.status}: ${detail || res.statusText}`);
  }
  const json: any = await res.json();
  return String(json?.text ?? "");
}
