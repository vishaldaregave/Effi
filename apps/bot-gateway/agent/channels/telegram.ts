import {
  defaultTelegramAuth,
  telegramChannel,
  type TelegramHandle,
  type TelegramChannelConfig,
} from "eve/channels/telegram";
import { telegramReportIngress } from "../lib/telegram-reporting.js";
import {
  isReportReviewMessage,
  isReportReadyForReview,
  synthesizeVoiceOrUndefined,
  voiceRecoveryText,
  voicePreferences,
} from "../../src/voice.js";
import { sendTelegramVoice } from "../../src/telegram-voice-delivery.js";
import { failureContext } from "../../src/failure-context.js";
import { authenticationPendingReply, isAuthenticationPending } from "../../src/authentication-pending.js";
import { draftCancellationReply, isDraftCancellationCommand } from "../../src/report-ingress.js";

const telegramApiBaseUrl = process.env.TELEGRAM_API_BASE_URL;

/**
 * Telegram's file download endpoint returns `application/octet-stream` (or a
 * generic type) regardless of the actual image, which fails the channel's
 * `image/*` upload policy when Eve lazily re-fetches a file part. The original
 * media type is preserved on the `telegram-file:` URL as a `mediaType` query
 * param, so rewrite the download response's content-type from it.
 */
const telegramFetchWithMediaType = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
  const response = await fetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "";
  if (!url.includes("/file/bot") || response.headers.get("content-type")?.startsWith("image/")) {
    return response;
  }
  try {
    const mediaType = new URL(url).searchParams.get("mediaType");
    if (mediaType) {
      const headers = new Headers(response.headers);
      headers.set("content-type", mediaType);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
  } catch {
    // leave the response untouched
  }
  return response;
};

const telegramConversationFor = (telegram: TelegramHandle): string => (
  telegram.messageThreadId === undefined
    ? telegram.chatId
    : `${telegram.chatId}:${telegram.messageThreadId}`
);

const retryInstructionFor = (message: Parameters<NonNullable<TelegramChannelConfig["onMessage"]>>[1]): string => {
  const hasVoice = Boolean(message.raw.voice || message.raw.audio);
  if (hasVoice) return "I received your voice note, but could not process it. Please retry only the voice note.";
  const hasPhoto = message.attachments.some((attachment) => attachment.kind === "photo" || attachment.mediaType?.startsWith("image/"));
  if (hasPhoto) return "I received your message, but could not process the photo. Please retry only the photo.";
  return "I received your message, but could not process it. Please retry only this message.";
};

const sendTelegramVoiceReply = async (telegram: TelegramHandle, text: string): Promise<void> => {
  const preference = voicePreferences.get("telegram", telegramConversationFor(telegram));
  if (!preference || preference.modality === "text") {
    await telegram.post(text);
    return;
  }

  const isFinalInterpretation = isReportReadyForReview(
    telegramReportIngress.store.activeConversation("telegram", telegramConversationFor(telegram)),
  ) || isReportReviewMessage(text);
  const audio = await synthesizeVoiceOrUndefined(telegramReportIngress.voiceProvider, {
    text,
    languageCode: preference.languageCode,
  }, (error) => {
    console.warn("Effi Telegram voice synthesis failed; falling back to text:", error instanceof Error ? error.message : String(error));
  });
  if (!audio) {
    await telegram.post(text);
    return;
  }

  if (isFinalInterpretation) await telegram.post(text);
  try {
    await sendTelegramVoice({
      botToken: () => process.env.TELEGRAM_BOT_TOKEN ?? "",
      ...(telegramApiBaseUrl ? { apiBaseUrl: telegramApiBaseUrl } : {}),
      chatId: telegram.chatId,
      ...(telegram.messageThreadId === undefined ? {} : { messageThreadId: telegram.messageThreadId }),
      audio,
    });
  } catch (error) {
    console.warn("Effi Telegram voice delivery failed; falling back to text:", error instanceof Error ? error.message : String(error));
    if (!isFinalInterpretation) await telegram.post(text);
  }
};

const sendTelegramVoiceRecovery = async (telegram: TelegramHandle): Promise<void> => {
  const conversationId = telegramConversationFor(telegram);
  const preference = voicePreferences.get("telegram", conversationId);
  const lang = preference?.languageCode ?? "mr-IN";
  const text = lang.startsWith("mr")
    ? "मला तुमचे बोलणे समजले नाही. कृपया पुन्हा एक लहान व्हॉइस नोट पाठवा."
    : voiceRecoveryText;
  const audio = await synthesizeVoiceOrUndefined(telegramReportIngress.voiceProvider, { text, languageCode: lang }, (error) => {
    console.warn("Effi Telegram voice recovery synthesis failed; falling back to text:", error instanceof Error ? error.message : String(error));
  });
  if (!audio) {
    await telegram.post(text);
    return;
  }
  try {
    await sendTelegramVoice({
      botToken: () => process.env.TELEGRAM_BOT_TOKEN ?? "",
      ...(telegramApiBaseUrl ? { apiBaseUrl: telegramApiBaseUrl } : {}),
      chatId: telegram.chatId,
      ...(telegram.messageThreadId === undefined ? {} : { messageThreadId: telegram.messageThreadId }),
      audio,
    });
  } catch (error) {
    console.warn("Effi Telegram voice delivery failed; falling back to text:", error instanceof Error ? error.message : String(error));
    await telegram.post(text);
  }
};

const config: TelegramChannelConfig = {
  ...(process.env.TELEGRAM_BOT_USERNAME ? { botUsername: process.env.TELEGRAM_BOT_USERNAME } : {}),
  turnPolicy: "steer",
  // Inbound photos become lazy file parts on the user message (fetched fresh
  // per turn) instead of being persisted as base64 in session history. The
  // dispatch-time check validates the real media type (image/*) from message
  // metadata; the per-turn re-fetch sees Telegram's download header
  // (application/octet-stream), so allow that here too.
  uploadPolicy: { maxBytes: 10 * 1024 * 1024, allowedMediaTypes: ["image/*", "application/octet-stream"] },
  api: { fetch: telegramFetchWithMediaType },
  events: {
    "message.completed": async (eventData, channel) => {
      if (!eventData.message || eventData.finishReason === "tool-calls") return;
      await sendTelegramVoiceReply(channel.telegram, eventData.message);
    },
  },
  onMessage: async (ctx, message) => {
    const conversationId = telegramConversationFor(ctx.telegram);
    let record;
    try {
      record = await telegramReportIngress.accept(message);
    } catch (error) {
      console.error("Effi Telegram turn failed", { messageId: message.messageId, ...failureContext("inbound processing or delivery", error) });
      await sendTelegramVoiceReply(ctx.telegram, retryInstructionFor(message));
      return null;
    }
    if (!record) {
      if (isAuthenticationPending(telegramReportIngress.store, "telegram", conversationId)) {
        await sendTelegramVoiceReply(ctx.telegram, authenticationPendingReply);
      }
      return null;
    }
    const textCommand = record.inbound.text?.trim().toLowerCase();
    if (textCommand === "/start") {
      await telegramReportIngress.cancelDurably(record);
      await sendTelegramVoiceReply(ctx.telegram, "Hello! I am Effi, your civic assistant. Please describe the civic issue you would like to report, or send a photo or voice note to begin.");
      return null;
    }
    if (isDraftCancellationCommand(record.inbound)) {
      await telegramReportIngress.cancelDurably(record);
      await sendTelegramVoiceReply(ctx.telegram, draftCancellationReply);
      return null;
    }
    if (record.persisted.voice && record.persisted.voice.status !== "transcribed") {
      await sendTelegramVoiceRecovery(ctx.telegram);
      return null;
    }
    if (record.conversation.phase === "authentication_pending") {
      await sendTelegramVoiceReply(ctx.telegram, authenticationPendingReply);
      return null;
    }
    return {
      auth: defaultTelegramAuth(message),
      context: [telegramReportIngress.contextFor(record)],
      title: "Effi civic report registration",
    };
  },
};

export default telegramChannel(config);
