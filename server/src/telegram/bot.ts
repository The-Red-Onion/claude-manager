import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Bot, InlineKeyboard, InputFile, GrammyError } from "grammy";
import type { ConfigStore } from "../config.js";
import type { SessionManager } from "../sessions/manager.js";
import type { ChatEvent, PendingAsk, SessionInfo } from "../types.js";
import { listCliSessions, findCliSession } from "../claudeCliSessions.js";
import { transcribe } from "./stt.js";
import {
  esc,
  mdToHtml,
  htmlToPlain,
  stripAnsi,
  timeAgo,
  safeFilename,
  sessionDetail,
  sessionLine,
  STATUS_EMOJI,
  STATUS_LABEL,
} from "./format.js";

/** Telegram message text limit is 4096; leave room for tags + cost line. */
const BODY_LIMIT = 2800;
/** Bots can upload up to 50 MB. */
const MAX_FILE_BYTES = 45 * 1024 * 1024;
/** Throttle for live status message edits. */
const STATUS_EDIT_MS = 3000;
/** Extensions worth auto-attaching when Claude mentions a created file. */
const ATTACH_EXT = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "png", "jpg",
  "jpeg", "gif", "webp", "svg", "zip", "tar", "gz", "mp3", "mp4", "wav",
  "txt", "md", "html", "epub",
]);

/** Pinned command menu (the "/" button next to the input box). */
const BOT_COMMANDS = [
  { command: "sessions", description: "📋 List & open sessions" },
  { command: "new", description: "✦ New Claude session — /new <task>" },
  { command: "adopt", description: "📲 Continue a session from your laptop" },
  { command: "term", description: "❯ New terminal (shell)" },
  { command: "model", description: "🧠 Switch model of current session" },
  { command: "effort", description: "🎚 Default reasoning effort" },
  { command: "rename", description: "✏️ Rename current session — /rename <name>" },
  { command: "get", description: "📎 Fetch a file — /get <path>" },
  { command: "kill", description: "🗑 Close current session" },
  { command: "start", description: "🎛 Help & main menu" },
];

interface StatusMsg {
  chatId: number;
  messageId: number;
  lastText: string;
  timer: NodeJS.Timeout | null;
}

interface ShellCapture {
  chatId: number;
  buf: string;
  timer: NodeJS.Timeout | null;
  startedAt: number;
}

/**
 * Telegram remote for the multiplexer. Every session is reachable; Claude's
 * permission + choice prompts become tappable inline buttons; you get pinged
 * when a session finishes or needs you. One "current session" per chat routes
 * plain-text messages as tasks; replying to a session's message routes there.
 */
export class TelegramBridge {
  private bot: Bot | null = null;
  private current = new Map<number, string>(); // chatId -> sessionId
  private askMessages = new Map<string, { chatId: number; messageId: number }>();
  /** `${chatId}:${messageId}` -> sessionId, for reply-routing. */
  private msgSessions = new Map<string, string>();
  /** sessionId -> live status message being edited while Claude works. */
  private status = new Map<string, StatusMsg>();
  /** sessionId -> pending terminal output capture (after a TG command). */
  private shellCapture = new Map<string, ShellCapture>();
  private started = false;

  constructor(
    private manager: SessionManager,
    private config: ConfigStore,
    private webUrl: () => string,
  ) {
    this.wireManager();
    this.config.on("change", () => this.restartIfTokenChanged());
  }

  private restartIfTokenChanged() {
    const token = this.config.get().telegram.botToken;
    if (token && !this.started) void this.start();
  }

  async start() {
    const token = this.config.get().telegram.botToken;
    if (!token || this.started) return;
    this.bot = new Bot(token);
    this.registerHandlers();
    try {
      await this.bot.init();
      await this.bot.api.setMyCommands(BOT_COMMANDS).catch(() => {});
      this.started = true;
      this.bot.start({ drop_pending_updates: true }).catch(() => {});
      console.log(`[telegram] bot @${this.bot.botInfo.username} online`);
    } catch (e: any) {
      console.error("[telegram] failed to start:", e?.message ?? e);
      this.bot = null;
    }
  }

  private allowed(userId: number | undefined): boolean {
    if (!userId) return false;
    const ids = this.config.get().telegram.allowedUserIds;
    if (ids.length === 0) return true; // first user claims it via /start
    return ids.includes(userId);
  }

  // ---- message → session routing ----

  private trackMsg(chatId: number, messageId: number, sessionId: string) {
    this.msgSessions.set(`${chatId}:${messageId}`, sessionId);
    if (this.msgSessions.size > 600) {
      const oldest = this.msgSessions.keys().next().value;
      if (oldest) this.msgSessions.delete(oldest);
    }
  }

  /** Reply-to a session message → that session; otherwise the current one. */
  private routeTarget(ctx: any): string | null {
    const replyTo = ctx.message?.reply_to_message?.message_id;
    if (replyTo) {
      const sid = this.msgSessions.get(`${ctx.chat.id}:${replyTo}`);
      if (sid && this.manager.info(sid)) return sid;
    }
    const id = this.current.get(ctx.chat.id);
    return id && this.manager.info(id) ? id : null;
  }

  /** Send a task to a session + start live feedback. */
  private async dispatch(ctx: any, sessionId: string, text: string) {
    const info = this.manager.info(sessionId);
    if (!info || !this.manager.sendMessage(sessionId, text)) return;
    await ctx.react("👀").catch(() => {});
    if (info.kind === "claude") {
      await this.startStatus(ctx.chat.id, sessionId);
    } else {
      this.armShellCapture(ctx.chat.id, sessionId);
    }
  }

  // ---- handlers ----

  private registerHandlers() {
    const bot = this.bot!;

    bot.command("start", async (ctx) => {
      const userId = ctx.from?.id;
      const tg = this.config.get().telegram;
      if (tg.allowedUserIds.length === 0 && userId) {
        this.config.update({
          telegram: { ...tg, allowedUserIds: [userId], notifyChatId: ctx.chat.id },
        });
      } else if (!this.allowed(userId)) {
        return ctx.reply("⛔️ Not authorized.");
      } else {
        this.config.update({ telegram: { ...tg, notifyChatId: ctx.chat.id } });
      }
      await ctx.reply(
        [
          "🎛 <b>Claude Manager</b>",
          "",
          "Manage all your Claude sessions from here.",
          "",
          "/sessions — list &amp; open",
          "/new &lt;task&gt; — new Claude session",
          "/adopt — continue a session from your laptop",
          "/term — new terminal (shell)",
          "/rename &lt;name&gt; — rename current session",
          "/model — switch model (live)",
          "/effort — default reasoning effort",
          "/get &lt;path&gt; — fetch a file from this machine",
          "/kill — close current session",
          "",
          "Pick a session, then just type — or send a voice note or a file.",
          "Reply to any session message to route to that session.",
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: this.mainKeyboard() },
      );
    });

    bot.command("sessions", (ctx) => this.replySessions(ctx.chat.id));

    bot.command("new", async (ctx) => {
      if (!this.allowed(ctx.from?.id)) return;
      const prompt = ctx.match?.toString().trim();
      const info = this.manager.create({
        kind: "claude",
        prompt: prompt || undefined,
      });
      this.current.set(ctx.chat.id, info.id);
      const msg = await ctx.reply(
        `✦ Started <b>${esc(info.name)}</b>\n<code>${esc(info.cwd)}</code>\n\nType to send it tasks.`,
        { parse_mode: "HTML", reply_markup: this.sessionKeyboard(info.id) },
      );
      this.trackMsg(ctx.chat.id, msg.message_id, info.id);
      if (prompt) await this.startStatus(ctx.chat.id, info.id);
    });

    bot.command("term", async (ctx) => {
      if (!this.allowed(ctx.from?.id)) return;
      const info = this.manager.create({ kind: "shell" });
      this.current.set(ctx.chat.id, info.id);
      const msg = await ctx.reply(
        `❯ Terminal <b>${esc(info.name)}</b> ready. Send shell commands as messages; output comes back here.`,
        { parse_mode: "HTML", reply_markup: this.sessionKeyboard(info.id) },
      );
      this.trackMsg(ctx.chat.id, msg.message_id, info.id);
    });

    bot.command("kill", async (ctx) => {
      const id = this.current.get(ctx.chat.id);
      if (id && this.manager.kill(id)) {
        this.current.delete(ctx.chat.id);
        await ctx.reply("🗑 Session closed.");
      } else await ctx.reply("No current session.");
    });

    bot.command("rename", async (ctx) => {
      if (!this.allowed(ctx.from?.id)) return;
      const name = ctx.match?.toString().trim();
      const id = this.current.get(ctx.chat.id);
      if (!id || !this.manager.info(id)) {
        return this.replySessions(ctx.chat.id, "Pick a session first:");
      }
      if (!name) return void ctx.reply("Usage: /rename <new name>");
      const old = this.name(id);
      this.manager.rename(id, name);
      await ctx.reply(`✏️ <b>${esc(old)}</b> → <b>${esc(this.name(id))}</b>`, {
        parse_mode: "HTML",
      });
    });

    bot.command("adopt", async (ctx) => {
      if (!this.allowed(ctx.from?.id)) return;
      const sessions = listCliSessions(6);
      if (!sessions.length) {
        return void ctx.reply("No recent Claude CLI sessions found on this machine.");
      }
      const kb = new InlineKeyboard();
      for (const s of sessions) {
        kb.text(
          `${path.basename(s.cwd)} · ${timeAgo(s.mtime)}`,
          `ad:${s.sessionId}`,
        ).row();
      }
      const body = sessions
        .map(
          (s) =>
            `• <b>${esc(path.basename(s.cwd))}</b> <i>(${timeAgo(s.mtime)})</i>${
              s.preview ? ` — <i>${esc(s.preview.slice(0, 60))}</i>` : ""
            }`,
        )
        .join("\n");
      await ctx.reply(
        `<b>Recent Claude CLI sessions:</b>\n\n${body}\n\nTap one to continue it here — full history included.`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    });

    bot.command("model", async (ctx) => {
      if (!this.allowed(ctx.from?.id)) return;
      const id = this.current.get(ctx.chat.id);
      const info = id ? this.manager.info(id) : undefined;
      if (!id || !info || info.kind !== "claude") {
        return void ctx.reply("Pick a Claude session first: /sessions");
      }
      const kb = new InlineKeyboard()
        .text("Default", `m:${id}:`)
        .text("Opus", `m:${id}:opus`)
        .row()
        .text("Sonnet", `m:${id}:sonnet`)
        .text("Haiku", `m:${id}:haiku`);
      await ctx.reply(
        `Model for <b>${esc(info.name)}</b> · current: <b>${esc(info.model || "default")}</b>\nApplies immediately, mid-session:`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    });

    bot.command("effort", async (ctx) => {
      if (!this.allowed(ctx.from?.id)) return;
      const cfg = this.config.get();
      const kb = new InlineKeyboard();
      (["low", "medium", "high", "xhigh", "max"] as const).forEach((l, i) => {
        kb.text(l, `ef:${l}`);
        if (i === 2) kb.row();
      });
      kb.row().text("default", "ef:");
      await ctx.reply(
        `Reasoning effort · current: <b>${esc(cfg.claude.effort || "default")}</b>\nApplies to <i>new</i> Claude sessions:`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    });

    bot.command("get", async (ctx) => {
      if (!this.allowed(ctx.from?.id)) return;
      let p = ctx.match?.toString().trim();
      if (!p) return void ctx.reply("Usage: /get <file path>");
      if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
      try {
        const st = fs.statSync(p);
        if (!st.isFile()) throw new Error("not a file");
        if (st.size > MAX_FILE_BYTES) {
          return void ctx.reply("⚠️ File is over 45 MB — Telegram bots can't send that.");
        }
        await ctx.replyWithDocument(new InputFile(p));
      } catch {
        await ctx.reply(`Can't read that file:\n${p}`);
      }
    });

    bot.on("callback_query:data", (ctx) => this.onCallback(ctx));

    // Voice notes / audio → speech-to-text → task
    bot.on(["message:voice", "message:audio", "message:video_note"], (ctx) =>
      this.onVoice(ctx),
    );

    // Photos / documents → saved to disk, path handed to the session
    bot.on(["message:photo", "message:document"], (ctx) => this.onFile(ctx));

    bot.on("message:text", async (ctx) => {
      if (!this.allowed(ctx.from?.id)) return;
      const text = ctx.message.text;
      if (text.startsWith("/")) return;
      const id = this.routeTarget(ctx);
      if (!id) return this.replySessions(ctx.chat.id, "Pick a session first:");
      await this.dispatch(ctx, id, text);
    });
  }

  // ---- voice ----

  private async onVoice(ctx: any) {
    if (!this.allowed(ctx.from?.id)) return;
    const stt = this.config.get().stt;
    if (!stt.apiKey) {
      return void ctx.reply(
        "🎤 Voice messages need a speech-to-text key.\nAdd an OpenAI or Groq API key in Settings → Voice transcription.",
      );
    }
    try {
      const file = await ctx.getFile();
      if (!file.file_path) throw new Error("no file path from Telegram");
      const buf = await this.downloadTgFile(file.file_path);
      const text = (await transcribe(buf, file.file_path, stt)).trim();
      if (!text) return void ctx.reply("🎤 Couldn't make out anything — try again?");
      const msg = await ctx.reply(`🎤 <i>${esc(text.slice(0, 1000))}</i>`, {
        parse_mode: "HTML",
      });
      const id = this.routeTarget(ctx);
      if (!id) {
        return this.replySessions(ctx.chat.id, "Transcribed — now pick a session:");
      }
      this.trackMsg(ctx.chat.id, msg.message_id, id);
      await this.dispatch(ctx, id, text);
    } catch (e: any) {
      await ctx
        .reply(`🎤 Transcription failed: ${String(e?.message ?? e).slice(0, 200)}`)
        .catch(() => {});
    }
  }

  // ---- incoming files ----

  private async onFile(ctx: any) {
    if (!this.allowed(ctx.from?.id)) return;
    const id = this.routeTarget(ctx);
    if (!id) return this.replySessions(ctx.chat.id, "Pick a session first:");
    const caption: string = ctx.message.caption?.trim() ?? "";
    try {
      const file = await ctx.getFile();
      if (!file.file_path) throw new Error("no file path from Telegram");
      const buf = await this.downloadTgFile(file.file_path);
      const origName: string =
        ctx.message.document?.file_name ||
        `photo_${file.file_unique_id}${path.extname(file.file_path) || ".jpg"}`;
      const dir = path.join(os.homedir(), ".claude-manager", "inbox", id);
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, safeFilename(origName));
      fs.writeFileSync(dest, Buffer.from(buf));
      const text = `${caption ? caption + "\n\n" : ""}[The user sent a file via Telegram. It is saved at: ${dest} — read it if relevant.]`;
      await this.dispatch(ctx, id, text);
    } catch (e: any) {
      await ctx
        .reply(`📎 Couldn't receive the file: ${String(e?.message ?? e).slice(0, 200)}`)
        .catch(() => {});
    }
  }

  private async downloadTgFile(filePath: string): Promise<ArrayBuffer> {
    const token = this.config.get().telegram.botToken;
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!res.ok) throw new Error(`file download failed (${res.status})`);
    return res.arrayBuffer();
  }

  // ---- callbacks ----

  private async onCallback(ctx: any) {
    const data: string = ctx.callbackQuery.data;
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.from.id;
    const [tag, ...rest] = data.split(":");

    try {
      if (tag === "s") {
        this.current.set(chatId, rest[0]);
        await ctx.answerCallbackQuery({ text: "Selected" });
        await this.editToDetail(ctx, rest[0]);
      } else if (tag === "a") {
        const [sessionId, askId, key] = rest;
        const ok = this.manager.answerAsk(sessionId, askId, [key]);
        await ctx.answerCallbackQuery({ text: ok ? "Sent ✓" : "Expired" });
        const label = { allow: "✅ Allowed", allow_always: "♾️ Allowed always", deny: "❌ Denied" }[key] ?? key;
        await ctx.editMessageText(`${ctx.callbackQuery.message?.text ?? ""}\n\n➡️ ${label}`).catch(() => {});
      } else if (tag === "i") {
        this.manager.interrupt(rest[0]);
        await ctx.answerCallbackQuery({ text: "⏹ Interrupted" });
      } else if (tag === "k") {
        this.manager.kill(rest[0]);
        this.current.delete(chatId);
        await ctx.answerCallbackQuery({ text: "🗑 Closed" });
        await ctx.editMessageText("🗑 Session closed.").catch(() => {});
      } else if (tag === "list") {
        await ctx.answerCallbackQuery();
        await this.replySessions(chatId);
      } else if (tag === "new") {
        const info = this.manager.create({ kind: "claude" });
        this.current.set(chatId, info.id);
        await ctx.answerCallbackQuery({ text: "Started" });
        await this.editToDetail(ctx, info.id);
      } else if (tag === "ad") {
        const cli = findCliSession(rest.join(":"));
        if (!cli) {
          await ctx.answerCallbackQuery({ text: "Session not found" });
          return;
        }
        const info = this.manager.create({
          kind: "claude",
          cwd: cli.cwd,
          name: path.basename(cli.cwd),
          resumeSessionId: cli.sessionId,
        });
        this.current.set(chatId, info.id);
        await ctx.answerCallbackQuery({ text: "Adopted ✓" });
        await ctx
          .editMessageText(
            `📲 Continuing <b>${esc(info.name)}</b> here\n<code>${esc(info.cwd)}</code>\n\nFull history restored — just type.`,
            { parse_mode: "HTML", reply_markup: this.sessionKeyboard(info.id) },
          )
          .catch(() => {});
        const mid = ctx.callbackQuery?.message?.message_id;
        if (mid) this.trackMsg(chatId, mid, info.id);
      } else if (tag === "m") {
        const [sid, model] = rest;
        const ok = this.manager.setModel(sid, model ?? "");
        await ctx.answerCallbackQuery({
          text: ok ? `Model: ${model || "default"}` : "Session gone",
        });
      } else if (tag === "ef") {
        const level = (rest[0] ?? "") as any;
        const c = this.config.get();
        this.config.update({ claude: { ...c.claude, effort: level } });
        await ctx.answerCallbackQuery({ text: `Effort: ${level || "default"}` });
      } else {
        await ctx.answerCallbackQuery();
      }
    } catch {
      await ctx.answerCallbackQuery().catch(() => {});
    }
  }

  // ---- rendering ----

  private mainKeyboard(): InlineKeyboard {
    const kb = new InlineKeyboard()
      .text("📋 Sessions", "list")
      .text("✦ New Claude", "new");
    const url = this.webUrl();
    if (/^https:\/\//.test(url)) kb.row().webApp("🖥 Open dashboard", url);
    return kb;
  }

  private sessionKeyboard(id: string): InlineKeyboard {
    return new InlineKeyboard()
      .text("⏹ Interrupt", `i:${id}`)
      .text("🗑 Close", `k:${id}`)
      .row()
      .text("📋 All sessions", "list");
  }

  private async replySessions(chatId: number, header = "Your sessions:") {
    const sessions = this.manager.list();
    if (!this.bot) return;
    if (!sessions.length) {
      await this.bot.api.sendMessage(chatId, "No sessions yet.", {
        reply_markup: this.mainKeyboard(),
      });
      return;
    }
    const kb = new InlineKeyboard();
    for (const s of sessions) {
      kb.text(
        `${STATUS_EMOJI[s.status]} ${s.name}${s.pendingAsk ? " ⏳" : ""}`,
        `s:${s.id}`,
      ).row();
    }
    kb.text("✦ New Claude", "new");
    const body = sessions.map(sessionLine).join("\n");
    await this.bot.api.sendMessage(chatId, `<b>${header}</b>\n\n${body}`, {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  }

  private async editToDetail(ctx: any, id: string) {
    const info = this.manager.info(id);
    if (!info) return;
    await ctx
      .editMessageText(sessionDetail(info), {
        parse_mode: "HTML",
        reply_markup: this.sessionKeyboard(id),
      })
      .catch(() => {});
    const chatId = ctx.chat?.id ?? ctx.callbackQuery?.from?.id;
    const mid = ctx.callbackQuery?.message?.message_id;
    if (chatId && mid) this.trackMsg(chatId, mid, id);
  }

  // ---- live status message ----

  private async startStatus(chatId: number, sessionId: string) {
    if (!this.bot || this.status.has(sessionId)) return;
    try {
      const msg = await this.bot.api.sendMessage(
        chatId,
        `🟢 <b>${esc(this.name(sessionId))}</b> — working…`,
        { parse_mode: "HTML" },
      );
      this.status.set(sessionId, {
        chatId,
        messageId: msg.message_id,
        lastText: "",
        timer: null,
      });
      this.trackMsg(chatId, msg.message_id, sessionId);
    } catch (e) {
      if (e instanceof GrammyError) console.error("[telegram]", e.description);
    }
  }

  private onChatEvent(id: string, e: ChatEvent) {
    const st = this.status.get(id);
    if (!st) return;
    if (e.kind === "ask") {
      // Waiting on the user — update immediately.
      if (st.timer) {
        clearTimeout(st.timer);
        st.timer = null;
      }
      void this.editStatus(id);
      return;
    }
    if (e.kind !== "tool" && e.kind !== "assistant" && e.kind !== "info") return;
    if (st.timer) return; // an edit is already scheduled
    st.timer = setTimeout(() => {
      st.timer = null;
      void this.editStatus(id);
    }, STATUS_EDIT_MS);
  }

  private async editStatus(id: string) {
    const st = this.status.get(id);
    const info = this.manager.info(id);
    if (!st || !info || !this.bot) return;
    if (info.status === "idle" || info.status === "exited") return; // final edit comes via done
    const line = `${STATUS_EMOJI[info.status]} <b>${esc(info.name)}</b> — <i>${esc(
      (info.preview || STATUS_LABEL[info.status]).slice(0, 200),
    )}</i>`;
    if (line === st.lastText) return;
    st.lastText = line;
    await this.bot.api
      .editMessageText(st.chatId, st.messageId, line, { parse_mode: "HTML" })
      .catch(() => {});
  }

  // ---- terminal output capture ----

  private armShellCapture(chatId: number, sessionId: string) {
    const existing = this.shellCapture.get(sessionId);
    if (existing?.timer) clearTimeout(existing.timer);
    const cap: ShellCapture = { chatId, buf: "", timer: null, startedAt: Date.now() };
    this.shellCapture.set(sessionId, cap);
    // Flush even if the command produces no output at all.
    cap.timer = setTimeout(() => void this.flushShell(sessionId), 2500);
  }

  private onShellOutput(sessionId: string, data: string) {
    const cap = this.shellCapture.get(sessionId);
    if (!cap) return;
    cap.buf += data;
    if (cap.buf.length > 200_000) cap.buf = cap.buf.slice(-100_000);
    if (cap.timer) clearTimeout(cap.timer);
    // Flush after 1.5s of silence, or 20s total.
    const delay = Date.now() - cap.startedAt > 20_000 ? 0 : 1500;
    cap.timer = setTimeout(() => void this.flushShell(sessionId), delay);
  }

  private async flushShell(sessionId: string) {
    const cap = this.shellCapture.get(sessionId);
    if (!cap) return;
    this.shellCapture.delete(sessionId);
    if (cap.timer) clearTimeout(cap.timer);
    if (!this.bot) return;
    const clean = stripAnsi(cap.buf).trim();
    if (!clean) return;
    const info = this.manager.info(sessionId);
    const name = info?.name ?? sessionId;
    const tail = clean.length > 3000 ? clean.slice(-3000) : clean;
    const html = `❯ <b>${esc(name)}</b>\n<pre><code>${esc(tail)}</code></pre>`;
    const sent = await this.sendHtml(cap.chatId, html, { sessionId });
    if (sent && clean.length > 3000) {
      await this.sendDoc(
        cap.chatId,
        new InputFile(Buffer.from(clean, "utf8"), `${safeFilename(name)}-output.txt`),
        sessionId,
      );
    }
  }

  // ---- manager → telegram notifications ----

  private wireManager() {
    this.manager.on("ask", (id: string, ask: PendingAsk) => this.notifyAsk(id, ask));
    this.manager.on("done", (id: string, summary: { text: string; isError: boolean }) =>
      this.notifyDone(id, summary),
    );
    this.manager.on("session_error", (id: string, message: string) =>
      this.notify(`🔴 <b>${esc(this.name(id))}</b> error:\n${esc(message)}`, undefined, id),
    );
    this.manager.on("chat_event", (id: string, e: ChatEvent) => this.onChatEvent(id, e));
    this.manager.on("output", (id: string, data: string) => this.onShellOutput(id, data));
  }

  /** Called by the /api/handoff endpoint after adopting a laptop session. */
  async announceHandoff(info: SessionInfo) {
    const chatId = this.notifyChat();
    if (!chatId) return;
    this.current.set(chatId, info.id);
    await this.sendHtml(
      chatId,
      `📲 <b>${esc(info.name)}</b> handed off from your laptop\n<code>${esc(info.cwd)}</code>\n\nFull history restored — type here to continue.`,
      { keyboard: this.sessionKeyboard(info.id), sessionId: info.id },
    );
  }

  private name(id: string): string {
    return this.manager.info(id)?.name ?? id;
  }

  private notifyChat(): number | null {
    return this.config.get().telegram.notifyChatId;
  }

  /** Send HTML with graceful plain-text fallback. Returns true if delivered. */
  private async sendHtml(
    chatId: number,
    html: string,
    opts: { keyboard?: InlineKeyboard; sessionId?: string } = {},
  ): Promise<boolean> {
    if (!this.bot) return false;
    try {
      const msg = await this.bot.api.sendMessage(chatId, html, {
        parse_mode: "HTML",
        reply_markup: opts.keyboard,
      });
      if (opts.sessionId) this.trackMsg(chatId, msg.message_id, opts.sessionId);
      return true;
    } catch (e) {
      if (!(e instanceof GrammyError)) return false;
      try {
        const msg = await this.bot.api.sendMessage(
          chatId,
          htmlToPlain(html).slice(0, 4000),
          { reply_markup: opts.keyboard },
        );
        if (opts.sessionId) this.trackMsg(chatId, msg.message_id, opts.sessionId);
        return true;
      } catch (e2) {
        if (e2 instanceof GrammyError) console.error("[telegram]", e2.description);
        return false;
      }
    }
  }

  private async sendDoc(chatId: number, file: InputFile, sessionId?: string) {
    if (!this.bot) return;
    try {
      const msg = await this.bot.api.sendDocument(chatId, file);
      if (sessionId) this.trackMsg(chatId, msg.message_id, sessionId);
    } catch (e) {
      if (e instanceof GrammyError) console.error("[telegram]", e.description);
    }
  }

  private async notify(html: string, keyboard?: InlineKeyboard, sessionId?: string) {
    const chatId = this.notifyChat();
    if (!chatId) return;
    await this.sendHtml(chatId, html, { keyboard, sessionId });
  }

  private async notifyAsk(sessionId: string, ask: PendingAsk) {
    const chatId = this.notifyChat();
    if (!this.bot || !chatId) return;
    const kb = new InlineKeyboard();
    ask.options.forEach((o, i) => {
      kb.text(o.label, `a:${sessionId}:${ask.id}:${o.key}`);
      if ((i + 1) % 2 === 0) kb.row();
    });
    const icon = ask.type === "question" ? "❓" : "🔐";
    const body = [
      `${icon} <b>${esc(this.name(sessionId))}</b> needs you`,
      "",
      `<b>${esc(ask.title)}</b>`,
      ask.detail ? `<code>${esc(ask.detail.slice(0, 300))}</code>` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const msg = await this.bot.api.sendMessage(chatId, body, {
        parse_mode: "HTML",
        reply_markup: kb,
      });
      this.askMessages.set(ask.id, { chatId, messageId: msg.message_id });
      this.trackMsg(chatId, msg.message_id, sessionId);
    } catch (e) {
      if (e instanceof GrammyError) console.error("[telegram]", e.description);
    }
  }

  private async notifyDone(
    sessionId: string,
    summary: { text: string; isError: boolean },
  ) {
    const info = this.manager.info(sessionId);
    if (!info) return;
    // Only ping for claude sessions or non-zero shell exits to avoid noise.
    if (info.kind !== "claude" && !summary.isError) return;

    const st = this.status.get(sessionId);
    if (st?.timer) clearTimeout(st.timer);
    this.status.delete(sessionId);

    const chatId = st?.chatId ?? this.notifyChat();
    if (!this.bot || !chatId) return;

    const icon = summary.isError ? "🔴" : "✅";
    const cost =
      info.stats.costUsd != null
        ? `\n\n<i>$${info.stats.costUsd.toFixed(3)} · ${info.stats.turns ?? 0} turns</i>`
        : "";
    const full = summary.text;
    const truncated = full.length > BODY_LIMIT;
    const note = truncated ? `\n\n<i>📎 full answer attached below</i>` : "";
    const html = `${icon} <b>${esc(info.name)}</b>\n\n${mdToHtml(
      truncated ? full.slice(0, BODY_LIMIT) + "…" : full,
    )}${note}${cost}`;

    // Prefer editing the live status message into the final result.
    let delivered = false;
    if (st) {
      delivered = await this.bot.api
        .editMessageText(st.chatId, st.messageId, html, {
          parse_mode: "HTML",
          reply_markup: this.sessionKeyboard(sessionId),
        })
        .then(() => true)
        .catch(() => false);
    }
    if (!delivered) {
      delivered = await this.sendHtml(chatId, html, {
        keyboard: this.sessionKeyboard(sessionId),
        sessionId,
      });
    }
    if (!delivered) {
      await this.bot.api
        .sendMessage(chatId, `${icon} ${info.name}\n\n${full.slice(0, 3500)}`)
        .catch(() => {});
    }

    // Long answers → attach the whole thing as markdown.
    if (truncated) {
      await this.sendDoc(
        chatId,
        new InputFile(Buffer.from(full, "utf8"), `${safeFilename(info.name)}-answer.md`),
        sessionId,
      );
    }

    // If Claude mentions files it created (e.g. ~/Downloads/report.docx),
    // attach them so they're usable straight from the phone.
    for (const f of extractMentionedFiles(full)) {
      await this.sendDoc(chatId, new InputFile(f), sessionId);
    }
  }

  stop() {
    this.bot?.stop();
    this.started = false;
  }
}

/** Absolute or ~ paths in the text that exist on disk and look shareable. */
function extractMentionedFiles(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /(?:~|\/)(?:[\w@.+-]+\/)*[\w@.+-]+\.([A-Za-z0-9]{1,6})(?=[)\s"'`,;!?]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < 3) {
    if (!ATTACH_EXT.has(m[1].toLowerCase())) continue;
    let p = m[0];
    if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      const st = fs.statSync(p);
      if (st.isFile() && st.size > 0 && st.size <= MAX_FILE_BYTES) out.push(p);
    } catch {
      /* mentioned but doesn't exist */
    }
  }
  return out;
}
