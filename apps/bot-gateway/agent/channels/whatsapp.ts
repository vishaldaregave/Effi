import { Boom } from "@hapi/boom";
import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  type BaileysEventMap,
  type WAMessage,
  type WAMessageKey,
  type WASocket,
} from "baileys";
import { defineChannel, POST, type ChannelEvents, type ChannelFrom } from "eve/channels";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import QRCode from "qrcode";
import { authenticationPendingReply, isAuthenticationPending } from "../../src/authentication-pending.js";
import { createChannelAcknowledgementCallback } from "../../src/channel-auth-callback.js";
import { failureContext } from "../../src/failure-context.js";
import { draftCancellationReply, isDraftCancellationCommand } from "../../src/report-ingress.js";
import {
  detectTextLanguage,
  isReportReadyForReview,
  isReportReviewMessage,
  synthesizeVoiceOrUndefined,
  transcribeInboundVoice,
  voiceRecoveryText,
  voicePreferences,
} from "../../src/voice.js";
import {
  isWhatsAppStatusRequest,
  createWhatsAppTypingIndicator,
  isWhatsAppFreshStartCommand,
  normalizeWhatsAppMessage,
  parseWhatsAppAllowedNumbers,
  resolveAllowedWhatsAppSender,
  whatsappNumberedReviewAction,
  whatsappUserContent,
  type WhatsAppTypingIndicator,
  type WhatsAppSenderIdentity,
} from "../../src/whatsapp-channel.js";
import { FileMessageDedupe } from "../../src/whatsapp-persistence.js";
import { reliableVoiceProvider } from "../../src/reliable-voice-provider.js";
import { createVideoObservationProvider } from "../../src/video-observation.js";
import { durableReportStore, reportStore } from "../lib/reporting.js";
import { whatsappMediaStorage, whatsappReportIngress } from "../lib/whatsapp-reporting.js";

type PendingInput = {
  requestId: string;
  options: { id: string; label: string }[];
  allowFreeform: boolean;
};

type WhatsAppState = {
  jid: string;
  phoneJid: string;
  voiceReply: boolean;
  pendingInput: PendingInput | null;
  lastInboundKey?: WAMessageKey;
};

type WhatsAppChannelContext = {
  state: WhatsAppState;
  socket: WASocket | null;
};

type GlobalWhatsAppState = {
  socket: WASocket | null;
  socketStarting: Promise<WASocket> | null;
  from: ChannelFrom<WhatsAppState> | null;
  queuedMessages: WAMessage[];
  replyModesByJid: Map<string, boolean[]>;
  activeReplyModeByJid: Map<string, boolean>;
  typingIndicatorsByJid: Map<string, WhatsAppTypingIndicator>;
  listenerSocket: WASocket | null;
  bootstrap: Promise<void> | null;
};

declare global {
  var __effiWhatsAppState: GlobalWhatsAppState | undefined;
}

const globalState = (): GlobalWhatsAppState => {
  globalThis.__effiWhatsAppState ??= {
    socket: null,
    socketStarting: null,
    from: null,
    queuedMessages: [],
    replyModesByJid: new Map(),
    activeReplyModeByJid: new Map(),
    typingIndicatorsByJid: new Map(),
    listenerSocket: null,
    bootstrap: null,
  };
  globalThis.__effiWhatsAppState.typingIndicatorsByJid ??= new Map();
  return globalThis.__effiWhatsAppState;
};

const authDirectory = process.env.WHATSAPP_AUTH_DIR ?? join(".data", "whatsapp-auth");
const allowedNumbers = parseWhatsAppAllowedNumbers(process.env.WHATSAPP_ALLOWED_NUMBERS);
const messageDedupe = new FileMessageDedupe(join(authDirectory, "message-ids.json"));
const videoObservation = createVideoObservationProvider();
const statusBoundaryReply = "I can help register a new civic report, but WhatsApp does not provide report or case status. Please describe a new issue to begin.";

const authFor = (sender: WhatsAppSenderIdentity) => ({
  authenticator: "whatsapp-baileys",
  principalType: "user" as const,
  principalId: sender.phoneJid,
  attributes: {
    channel: "whatsapp",
    conversation_id: sender.jid,
    phone_number: sender.phoneNumber,
  },
});

const sendText = async (socket: WASocket, jid: string, text: string): Promise<void> => {
  const maxLength = 65_536;
  for (let start = 0; start < text.length; start += maxLength) {
    await socket.sendMessage(jid, { text: text.slice(start, start + maxLength) });
  }
};

const ffmpegExecutable = async (): Promise<string> => {
  const resolved = typeof ffmpegPath === "string" ? ffmpegPath : (ffmpegPath as unknown as { default?: string })?.default;
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    resolved,
    resolve(process.cwd(), "node_modules", "ffmpeg-static", binaryName),
    resolve(process.cwd(), "..", "..", "node_modules", "ffmpeg-static", binaryName),
    resolve(process.cwd(), "..", "..", "node_modules", ".pnpm", "ffmpeg-static@5.3.0", "node_modules", "ffmpeg-static", binaryName),
    binaryName,
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
  for (const candidate of candidates) {
    if (candidate === binaryName) return candidate;
    try {
      await access(candidate, constants.F_OK);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return binaryName;
};

const mp3ToWhatsAppVoiceNote = async (mp3: Buffer): Promise<Buffer> => new Promise((resolveVoice, reject) => {
  void ffmpegExecutable().then((executable) => {
    const ffmpeg = spawn(executable, [
      "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1",
      "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1",
    ], { stdio: "pipe" });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    ffmpeg.once("error", reject);
    ffmpeg.once("close", (code) => {
      if (code === 0) resolveVoice(Buffer.concat(output));
      else reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(errors).toString().trim()}`));
    });
    ffmpeg.stdin.end(mp3);
  }, reject);
});

const sendVoiceReply = async (socket: WASocket, jid: string, text: string, languageCode: string): Promise<void> => {
  const generated = await synthesizeVoiceOrUndefined(reliableVoiceProvider, { text, languageCode }, (error) => {
    console.error("Effi WhatsApp voice synthesis failed", failureContext("voice synthesis", error));
  });
  if (!generated) {
    await sendText(socket, jid, text);
    return;
  }
  try {
    const audio = await mp3ToWhatsAppVoiceNote(generated.data);
    await socket.sendMessage(jid, { audio, mimetype: "audio/ogg; codecs=opus", ptt: true });
  } catch (error) {
    console.error("Effi WhatsApp voice delivery failed", failureContext("voice conversion or delivery", error));
    await sendText(socket, jid, text);
  }
};

const sendVoiceRecovery = async (socket: WASocket, jid: string): Promise<void> => {
  await sendVoiceReply(socket, jid, voiceRecoveryText, "hi-IN");
};

const startTyping = async (socket: WASocket, jid: string): Promise<void> => {
  const state = globalState();
  let indicator = state.typingIndicatorsByJid.get(jid);
  if (!indicator) {
    indicator = createWhatsAppTypingIndicator(async (presence) => {
      await socket.sendPresenceUpdate(presence, jid);
    });
    state.typingIndicatorsByJid.set(jid, indicator);
  }
  await indicator.start();
};

const stopTyping = async (jid: string): Promise<void> => {
  const state = globalState();
  const indicator = state.typingIndicatorsByJid.get(jid);
  if (!indicator) return;
  state.typingIndicatorsByJid.delete(jid);
  await indicator.stop();
};

const stopAllTyping = async (): Promise<void> => {
  const state = globalState();
  const indicators = [...state.typingIndicatorsByJid.values()];
  state.typingIndicatorsByJid.clear();
  await Promise.all(indicators.map(async (indicator) => await indicator.stop()));
};

const renderInputRequest = (prompt: string, options: PendingInput["options"]): string => {
  if (options.length === 0) return prompt;
  return `${prompt}\n\n${options.map((option, index) => `${index + 1}. ${option.label}`).join("\n")}\n\nReply with a number.`;
};

const archiveLoggedOutAuth = async (): Promise<void> => {
  try {
    const archivedDirectory = `${authDirectory}.logged-out-${Date.now()}`;
    await rename(authDirectory, archivedDirectory);
    console.info(`[whatsapp] archived logged-out credentials at ${archivedDirectory}`);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
  }
};

const queueReplyMode = (jid: string, voiceReply: boolean): void => {
  const state = globalState();
  const modes = state.replyModesByJid.get(jid) ?? [];
  modes.push(voiceReply);
  state.replyModesByJid.set(jid, modes);
};

const handleInboundMessage = async (message: WAMessage): Promise<void> => {
  const state = globalState();
  const socket = state.socket;
  if (!socket || message.key.fromMe === true) return;
  const dynamicAllowedNumbers = parseWhatsAppAllowedNumbers(process.env.WHATSAPP_ALLOWED_NUMBERS);
  const sender = await resolveAllowedWhatsAppSender({
    jid: message.key.remoteJid,
    allowedNumbers: dynamicAllowedNumbers,
    getPhoneJidForLid: (lid) => socket.signalRepository.lidMapping.getPNForLID(lid),
    participant: message.key.participant,
  });
  if (!sender) {
    console.warn("[whatsapp] dropped message from unallowed or unresolvable sender", {
      jid: message.key.remoteJid,
      participant: message.key.participant,
    });
    return;
  }
  if (!state.from) {
    state.queuedMessages.push(message);
    void bootstrapFrom();
    return;
  }

  const providerId = message.key.id;
  if (!providerId || !(await messageDedupe.claim(providerId))) return;
  await startTyping(socket, sender.jid);
  try {
    const normalized = await normalizeWhatsAppMessage({
      message,
      socket,
      sender,
      mediaStorage: whatsappMediaStorage,
      videoObservation,
    });
    if (!normalized) {
      await stopTyping(sender.jid);
      await messageDedupe.complete(providerId);
      return;
    }
    let inbound = normalized.inbound;
    if (isWhatsAppFreshStartCommand(inbound.text)) {
      if (durableReportStore) await durableReportStore.cancelDraft(inbound);
      reportStore.cancelConversation("whatsapp", sender.jid);
      await state.from(sender.jid).reset({ reason: "Citizen requested a fresh WhatsApp report" });
      await sendText(socket, sender.jid, draftCancellationReply);
      await stopTyping(sender.jid);
      await messageDedupe.complete(providerId);
      return;
    }
    const numberedReviewAction = whatsappNumberedReviewAction(
      inbound.text,
      isReportReadyForReview(reportStore.activeConversation("whatsapp", sender.jid)),
    );
    if (numberedReviewAction) inbound = { ...inbound, action: numberedReviewAction };
    if (normalized.inbound.text && isWhatsAppStatusRequest(normalized.inbound.text)) {
      await sendText(socket, sender.jid, statusBoundaryReply);
      await stopTyping(sender.jid);
      await messageDedupe.complete(providerId);
      return;
    }

    let record = durableReportStore
      ? await whatsappReportIngress.acceptDurably(inbound, durableReportStore)
      : whatsappReportIngress.accept(inbound);
    record ??= whatsappReportIngress.acceptForDispatch(inbound);
    if (!record) {
      if (isAuthenticationPending(reportStore, "whatsapp", sender.jid)) {
        await sendText(socket, sender.jid, authenticationPendingReply);
      }
      await stopTyping(sender.jid);
      await messageDedupe.complete(providerId);
      return;
    }

    if (isDraftCancellationCommand(record.inbound)) {
      if (durableReportStore) await whatsappReportIngress.cancelDurably(record, durableReportStore);
      else reportStore.cancelConversation("whatsapp", sender.jid);
      await sendText(socket, sender.jid, draftCancellationReply);
      await stopTyping(sender.jid);
      await messageDedupe.complete(providerId);
      return;
    }

    if (normalized.stagedVoice) {
      inbound = await transcribeInboundVoice(normalized.inbound, normalized.stagedVoice, reliableVoiceProvider);
      record = durableReportStore
        ? await whatsappReportIngress.enrichVoiceDurably(record, inbound, durableReportStore)
        : whatsappReportIngress.enrichVoice(record, inbound);
      if (inbound.voice?.status !== "transcribed") {
        await sendVoiceRecovery(socket, sender.jid);
        await stopTyping(sender.jid);
        await messageDedupe.complete(providerId);
        return;
      }
      voicePreferences.remember({
        channel: "whatsapp",
        conversationId: sender.jid,
        ...(inbound.voiceTranscript ? { voiceTranscript: inbound.voiceTranscript } : {}),
        inputModality: "voice",
        ...(inbound.voice?.languageCode ? { languageCode: inbound.voice.languageCode } : {}),
      });
    }
    if (record.conversation.phase === "authentication_pending") {
      await sendText(socket, sender.jid, authenticationPendingReply);
      await stopTyping(sender.jid);
      await messageDedupe.complete(providerId);
      return;
    }

    queueReplyMode(sender.jid, normalized.voiceReply);
    await state.from(sender.jid).send(whatsappUserContent(normalized, inbound), {
      auth: authFor(sender),
      context: [whatsappReportIngress.contextFor(record)],
      title: "Effi civic report registration",
      state: {
        jid: sender.jid,
        phoneJid: sender.phoneJid,
        voiceReply: normalized.voiceReply,
        pendingInput: null,
        lastInboundKey: normalized.lastInboundKey,
      },
    });
    await messageDedupe.complete(providerId);
  } catch (error) {
    await stopTyping(sender.jid);
    await messageDedupe.release(providerId);
    console.error("Effi WhatsApp turn failed", { messageId: providerId, ...failureContext("inbound processing or delivery", error) });
    await sendText(socket, sender.jid, "I received your message, but could not process it. Please retry only this message.").catch(() => undefined);
  }
};

const bootstrapFrom = (): Promise<void> => {
  const state = globalState();
  state.bootstrap ??= (async () => {
    let delay = 500;
    while (state.socket && !state.from) {
      try {
        const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? "2000"}/whatsapp/bootstrap`, { method: "POST" });
        if (response.ok) return;
      } catch {
        // Eve can still be starting.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
      delay = Math.min(delay * 2, 30_000);
    }
  })().finally(() => {
    state.bootstrap = null;
  });
  return state.bootstrap;
};

const wireSocketListener = (): void => {
  void connectSocket().then((socket) => {
    const state = globalState();
    if (state.listenerSocket === socket) return;
    socket.ev.on("messages.upsert", async ({ messages, type }: BaileysEventMap["messages.upsert"]) => {
      if (type !== "notify") return;
      for (const message of messages) await handleInboundMessage(message);
    });
    state.listenerSocket = socket;
  }).catch((error) => console.error("Effi WhatsApp socket failed", failureContext("socket startup", error)));
};

const connectSocket = async (): Promise<WASocket> => {
  const state = globalState();
  if (state.socket) return state.socket;
  if (state.socketStarting) return state.socketStarting;
  if (allowedNumbers.size === 0) {
    console.info("[whatsapp] WHATSAPP_ALLOWED_NUMBERS is empty; accepting incoming messages from all senders.");
  }

  state.socketStarting = (async () => {
    const { state: authState, saveCreds } = await useMultiFileAuthState(authDirectory);
    const { version } = await fetchLatestBaileysVersion();
    const socket = makeWASocket({ version, browser: Browsers.ubuntu("effi-whatsapp"), auth: authState });
    state.socket = socket;
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        void QRCode.toString(qr, { type: "terminal", small: true }).then(
          (rendered) => console.info(`\n[whatsapp] Scan this QR in WhatsApp > Linked Devices:\n${rendered}`),
          (error) => console.error("Effi WhatsApp QR rendering failed", failureContext("QR rendering", error)),
        );
      }
      if (connection === "open") {
        console.info("[whatsapp] connected");
        void bootstrapFrom();
      }
      if (connection !== "close" || globalState().socket !== socket) return;
      const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : undefined;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const replaced = statusCode === DisconnectReason.connectionReplaced;
      const reconnect = !loggedOut && !replaced;
      const current = globalState();
      current.socket = null;
      current.socketStarting = null;
      current.listenerSocket = null;
      void stopAllTyping();
      console.error(`[whatsapp] connection closed with status ${statusCode ?? "unknown"}; reconnect=${reconnect || replaced}`);
      if (loggedOut) {
        void archiveLoggedOutAuth().then(() => setTimeout(wireSocketListener, 500)).catch((error) => {
          console.error("Effi WhatsApp auth reset failed", failureContext("logged-out auth archive", error));
        });
      } else if (reconnect) {
        setTimeout(wireSocketListener, 500);
      } else if (replaced) {
        setTimeout(wireSocketListener, 3000);
      }
    });
    return socket;
  })().catch((error) => {
    state.socket = null;
    state.socketStarting = null;
    throw error;
  });
  return state.socketStarting;
};

const acknowledgeWhatsApp = createChannelAcknowledgementCallback({
  channel: "whatsapp",
  callbackSecret: () => process.env.EFFI_AUTH_CALLBACK_SECRET,
  store: () => durableReportStore,
  send: async (conversationId, text) => {
    const socket = globalState().socket;
    if (!socket) throw new Error("WhatsApp is disconnected.");
    await sendText(socket, conversationId, text);
  },
});

const channel = defineChannel<WhatsAppState, WhatsAppChannelContext>({
  kindHint: "whatsapp",
  turnPolicy: "queue",
  state: { jid: "", phoneJid: "", voiceReply: false, pendingInput: null },
  metadata(state) {
    return { audience: "private" as const, jid: state.jid, phoneJid: state.phoneJid, hasPendingInput: state.pendingInput !== null };
  },
  context(state) {
    return { state, socket: globalState().socket };
  },
  routes: [
    POST("/whatsapp/bootstrap", async (_request, { from }) => {
      const state = globalState();
      state.from = from;
      if (process.env.WHATSAPP_CONNECT !== "0" && !state.socket && !state.socketStarting) {
        wireSocketListener();
      }
      const queued = state.queuedMessages.splice(0);
      for (const message of queued) await handleInboundMessage(message);
      return new Response("ok");
    }),
    POST("/effi/v1/whatsapp/auth/callback", acknowledgeWhatsApp),
  ],
  events: {
    async "turn.started"(_event, channelContext) {
      const { state, socket } = channelContext;
      const modes = globalState().replyModesByJid.get(state.jid);
      const voiceReply = modes?.shift() ?? state.voiceReply;
      if (modes?.length === 0) globalState().replyModesByJid.delete(state.jid);
      globalState().activeReplyModeByJid.set(state.jid, voiceReply);
      if (socket && state.jid) await startTyping(socket, state.jid);
    },
    async "actions.requested"(_event, { state, socket }) {
      if (socket && state.jid) await startTyping(socket, state.jid);
    },
    async "input.requested"(event, { state, socket }) {
      if (!state.jid) return;
      if (!socket) throw new Error("WhatsApp disconnected before Effi could deliver an input request.");
      for (const request of event.requests ?? []) {
        const pending: PendingInput = {
          requestId: request.requestId,
          options: (request.options ?? []).map(({ id, label }) => ({ id, label })),
          allowFreeform: request.allowFreeform ?? false,
        };
        state.pendingInput = pending;
        await sendText(socket, state.jid, renderInputRequest(request.prompt, pending.options));
      }
    },
    async "message.completed"(event, { state, socket }) {
      if (!state.jid || !event.message || event.finishReason === "tool-calls") return;
      if (!socket) throw new Error("WhatsApp disconnected before Effi could deliver its reply.");
      const preference = voicePreferences.get("whatsapp", state.jid);
      const isVoice = (preference?.modality === "voice") || (globalState().activeReplyModeByJid.get(state.jid) === true) || state.voiceReply;
      const finalInterpretation = isReportReadyForReview(reportStore.activeConversation("whatsapp", state.jid)) || isReportReviewMessage(event.message);
      if (isVoice) {
        if (finalInterpretation) await sendText(socket, state.jid, event.message);
        const replyLang = detectTextLanguage(event.message) ?? preference?.languageCode ?? "mr-IN";
        await sendVoiceReply(socket, state.jid, event.message, replyLang);
      } else {
        await sendText(socket, state.jid, event.message);
      }
      globalState().activeReplyModeByJid.delete(state.jid);
      if (state.lastInboundKey) await socket.readMessages([state.lastInboundKey]).catch(() => undefined);
    },
    async "session.waiting"(_event, { state, socket }) {
      if (socket && state.jid) await stopTyping(state.jid);
    },
    async "turn.failed"(_event, { state, socket }) {
      if (socket && state.jid) await sendText(socket, state.jid, "I could not process that message. Please try again.");
      if (state.jid) await stopTyping(state.jid);
    },
    async "session.failed"(_event, { state, socket }) {
      if (socket && state.jid) await sendText(socket, state.jid, "This conversation could not recover. Send /reset to start again.");
      if (state.jid) await stopTyping(state.jid);
    },
  } satisfies ChannelEvents<WhatsAppChannelContext>,
});

const normalizedUrl = import.meta.url.replace(/\\/g, "/");
const isSourceChannelFile =
  normalizedUrl.includes("/agent/channels/whatsapp.") &&
  !normalizedUrl.includes(".eve") &&
  !normalizedUrl.includes(".output");

const triggerBootstrap = (): void => {
  let attempts = 0;
  const poll = () => {
    attempts++;
    fetch(`http://127.0.0.1:${process.env.PORT ?? "2000"}/whatsapp/bootstrap`, { method: "POST" })
      .catch(() => {
        if (attempts < 30) setTimeout(poll, 1000);
      });
  };
  setTimeout(poll, 1500);
};

if (process.env.WHATSAPP_CONNECT !== "0" && !isSourceChannelFile) {
  triggerBootstrap();
}

export default channel;
