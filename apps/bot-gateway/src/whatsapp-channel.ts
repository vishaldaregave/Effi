import {
  downloadMediaMessage,
  getContentType,
  isLidUser,
  isPnUser,
  jidDecode,
  jidNormalizedUser,
  normalizeMessageContent,
  type WAMessage,
  type WAMessageKey,
  type WASocket,
} from "baileys";
import type { UserContent } from "ai";
import type { ExactCoordinates, InboundAttachment, InboundMessage, ReportAction } from "./simulated-report-registration.js";
import { pendingVoiceMessage, retryTransientOperation, type StagedVoiceInput } from "./voice.js";
import { safeStorageSegment, type EffiMediaStorage } from "./whatsapp-persistence.js";
import type { VideoObservationProvider } from "./video-observation.js";

export type WhatsAppSenderIdentity = {
  jid: string;
  phoneJid: string;
  phoneNumber: string;
};

type StructuredUserContent = Exclude<UserContent, string>;

export type NormalizedWhatsAppMessage = {
  inbound: InboundMessage;
  imageParts: StructuredUserContent;
  stagedVoice?: StagedVoiceInput;
  voiceReply: boolean;
  lastInboundKey: WAMessageKey;
};

type DownloadWhatsAppMedia = (message: WAMessage) => Promise<Buffer>;

export type NormalizeWhatsAppMessageOptions = {
  message: WAMessage;
  socket: WASocket;
  sender: WhatsAppSenderIdentity;
  mediaStorage: EffiMediaStorage;
  downloadMedia?: DownloadWhatsAppMedia;
  videoObservation?: VideoObservationProvider;
};

export type WhatsAppPresenceState = "composing" | "paused";

export type WhatsAppTypingIndicator = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

const digitsOnly = (value: string): string => value.replace(/\D/g, "");

export const isWhatsAppFreshStartCommand = (text: string | undefined): boolean => {
  const command = text?.trim().toLowerCase();
  return command === "/reset" || command === "/clear";
};

export const createWhatsAppTypingIndicator = (
  sendPresence: (state: WhatsAppPresenceState) => Promise<void>,
  repeatMs = 8_000,
): WhatsAppTypingIndicator => {
  let interval: ReturnType<typeof setInterval> | undefined;
  const composing = (): void => {
    void sendPresence("composing").catch(() => undefined);
  };
  return {
    async start() {
      if (interval) clearInterval(interval);
      await sendPresence("composing").catch(() => undefined);
      interval = setInterval(composing, repeatMs);
    },
    async stop() {
      if (interval) clearInterval(interval);
      interval = undefined;
      await sendPresence("paused").catch(() => undefined);
    },
  };
};

export const whatsappNumberedReviewAction = (text: string | undefined, reportReady: boolean): ReportAction | undefined => {
  if (!reportReady) return undefined;
  if (text?.trim() === "1") return "confirm";
  if (text?.trim() === "2") return "edit";
  return undefined;
};

export const parseWhatsAppAllowedNumbers = (value: string | undefined): ReadonlySet<string> => new Set(
  (value ?? "").split(",").map(digitsOnly).filter(Boolean),
);

const phoneNumberFromJid = (jid: string): string | undefined => {
  const decoded = jidDecode(jidNormalizedUser(jid));
  const phoneNumber = decoded ? digitsOnly(decoded.user) : "";
  return phoneNumber || undefined;
};

export const resolveAllowedWhatsAppSender = async (input: {
  jid: string | null | undefined;
  allowedNumbers: ReadonlySet<string>;
  getPhoneJidForLid: (lid: string) => Promise<string | null>;
}): Promise<WhatsAppSenderIdentity | undefined> => {
  const jid = input.jid ? jidNormalizedUser(input.jid) : "";
  if (!jid || (!isPnUser(jid) && !isLidUser(jid))) return undefined;
  const phoneJid = isPnUser(jid) ? jid : await input.getPhoneJidForLid(jid);
  if (!phoneJid) return undefined;
  const normalizedPhoneJid = jidNormalizedUser(phoneJid);
  const phoneNumber = phoneNumberFromJid(normalizedPhoneJid);
  if (!phoneNumber || !input.allowedNumbers.has(phoneNumber)) return undefined;
  return { jid, phoneJid: normalizedPhoneJid, phoneNumber };
};

const currentTime = (): string => new Date().toISOString();

const receivedAtFor = (message: WAMessage): string => {
  const raw = message.messageTimestamp;
  const seconds = typeof raw === "number"
    ? raw
    : typeof raw === "object" && raw !== null && "toNumber" in raw && typeof raw.toNumber === "function"
      ? raw.toNumber()
      : Number(raw);
  return Number.isFinite(seconds) ? new Date(seconds * 1_000).toISOString() : currentTime();
};

const exactLocation = (
  value: { degreesLatitude?: number | null; degreesLongitude?: number | null; isLive?: boolean | null } | null | undefined,
  source: ExactCoordinates["source"],
): ExactCoordinates | undefined => {
  const latitude = value?.degreesLatitude;
  const longitude = value?.degreesLongitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return undefined;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return undefined;
  return { source: value?.isLive === true ? "current_gps" : source, latitude, longitude };
};

const defaultDownloadMedia = (socket: WASocket): DownloadWhatsAppMedia => async (message) => {
  const downloaded = await downloadMediaMessage(message, "buffer", {}, {
    reuploadRequest: socket.updateMediaMessage,
    logger: socket.logger,
  });
  if (!Buffer.isBuffer(downloaded)) throw new Error("WhatsApp media download did not return bytes.");
  return downloaded;
};

const stageMedia = async (input: {
  mediaStorage: EffiMediaStorage;
  messageId: string;
  attachmentId: string;
  kind: InboundAttachment["kind"];
  mediaType: string;
  data: Buffer;
  observation?: string;
}): Promise<InboundAttachment> => {
  const copied = await retryTransientOperation(() => input.mediaStorage.copy({
    messageId: input.messageId,
    attachmentId: input.attachmentId,
    mediaType: input.mediaType,
    data: input.data,
  }));
  return {
    id: input.attachmentId,
    kind: input.kind,
    mediaType: input.mediaType,
    platformUrl: `whatsapp://media/${encodeURIComponent(input.messageId)}/${encodeURIComponent(input.attachmentId)}`,
    platformReference: `whatsapp:${input.messageId}:${input.attachmentId}`,
    storageKey: copied.storageKey,
    ...(input.observation === undefined ? {} : { observation: input.observation }),
  };
};

export const whatsappTextFromMessage = (message: WAMessage): string | undefined => {
  const content = normalizeMessageContent(message.message);
  const type = getContentType(content ?? undefined);
  const text = type === "conversation" ? content?.conversation : type === "extendedTextMessage" ? content?.extendedTextMessage?.text : undefined;
  const trimmed = text?.trim();
  return trimmed || undefined;
};

export const normalizeWhatsAppMessage = async (
  options: NormalizeWhatsAppMessageOptions,
): Promise<NormalizedWhatsAppMessage | undefined> => {
  const { message, sender, mediaStorage } = options;
  const providerId = message.key.id;
  if (!providerId) return undefined;
  const messageId = `whatsapp:${providerId}`;
  const content = normalizeMessageContent(message.message);
  const type = getContentType(content ?? undefined);
  if (!type || type === "stickerMessage") return undefined;

  const attachments: InboundAttachment[] = [];
  const imageParts: StructuredUserContent = [];
  const downloadMedia = options.downloadMedia ?? defaultDownloadMedia(options.socket);
  let text: string | undefined;
  let location: ExactCoordinates | undefined;
  let stagedVoice: StagedVoiceInput | undefined;
  let voiceReply = false;

  if (type === "conversation" || type === "extendedTextMessage") {
    text = whatsappTextFromMessage(message);
  } else if (type === "imageMessage") {
    text = content?.imageMessage?.caption?.trim() || undefined;
    const data = await downloadMedia(message);
    const mediaType = content?.imageMessage?.mimetype ?? "image/jpeg";
    const attachmentId = `${safeStorageSegment(providerId)}-image-0`;
    const attachment = await stageMedia({ mediaStorage, messageId, attachmentId, kind: "image", mediaType, data });
    attachments.push(attachment);
    imageParts.push({ type: "file", data, mediaType, filename: attachmentId });
  } else if (type === "audioMessage") {
    voiceReply = true;
    const data = await downloadMedia(message);
    const mediaType = content?.audioMessage?.mimetype ?? "audio/ogg";
    const attachmentId = `${safeStorageSegment(providerId)}-audio-0`;
    const attachment = await stageMedia({ mediaStorage, messageId, attachmentId, kind: "audio", mediaType, data });
    attachments.push(attachment);
    stagedVoice = { attachment, data, fileName: `${attachmentId}.ogg` };
  } else if (type === "videoMessage") {
    text = content?.videoMessage?.caption?.trim() || undefined;
    const data = await downloadMedia(message);
    const mediaType = content?.videoMessage?.mimetype ?? "video/mp4";
    const attachmentId = `${safeStorageSegment(providerId)}-video-0`;
    const observation = options.videoObservation ? await options.videoObservation({ data, mediaType }) : undefined;
    const attachment = await stageMedia({
      mediaStorage,
      messageId,
      attachmentId,
      kind: "video",
      mediaType,
      data,
      ...(observation === undefined ? {} : { observation }),
    });
    attachments.push(attachment);
  } else if (type === "locationMessage") {
    location = exactLocation(content?.locationMessage, "selected_pin");
  } else if (type === "liveLocationMessage") {
    location = exactLocation(content?.liveLocationMessage, "current_gps");
  } else {
    return undefined;
  }

  if (!text && !location && attachments.length === 0) return undefined;
  const inbound: InboundMessage = {
    id: messageId,
    providerEventId: providerId,
    channel: "whatsapp",
    conversationId: sender.jid,
    senderId: sender.phoneJid,
    receivedAt: receivedAtFor(message),
    ...(text ? { text } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(location ? { location } : {}),
  };
  return {
    inbound: stagedVoice ? pendingVoiceMessage(inbound, stagedVoice.attachment) : inbound,
    imageParts,
    ...(stagedVoice ? { stagedVoice } : {}),
    voiceReply,
    lastInboundKey: message.key,
  };
};

/**
 * Eve only resolves a pending `ask_question` from a follow-up message when
 * that message is a plain string (`resolveTextMessageInput` ignores
 * `UserContent` arrays). Send text-only turns as a string so numeric and
 * labelled replies to Effi's choice prompts resume the blocked turn; keep
 * the structured array when an image must ride along.
 */
export const whatsappUserContent = (
  normalized: Pick<NormalizedWhatsAppMessage, "imageParts">,
  inbound: InboundMessage,
): string | UserContent => {
  const text = [inbound.text, inbound.voiceTranscript].filter((value): value is string => Boolean(value?.trim())).join("\n\n");
  const locationText = inbound.location
    ? `Exact WhatsApp location: latitude ${inbound.location.latitude}, longitude ${inbound.location.longitude} (${inbound.location.source}).`
    : undefined;
  if (normalized.imageParts.length === 0) {
    return [text, locationText].filter((value): value is string => Boolean(value)).join("\n\n");
  }
  const parts: StructuredUserContent = [];
  if (text) parts.push({ type: "text", text });
  parts.push(...normalized.imageParts);
  if (locationText) parts.push({ type: "text", text: locationText });
  return parts;
};

export const isWhatsAppStatusRequest = (text: string): boolean => {
  const normalized = text.trim().toLocaleLowerCase();
  if (!normalized) return false;
  const statusTerms = /\b(status|progress|tracking|track|update|registered|submitted|resolved|fixed|done)\b|स्थिति|स्टेटस|प्रगति|ट्रैक|अपडेट|रजिस्टर|जमा हुआ/iu;
  const reportTerms = /\b(report|case|complaint|submission|ticket|issue)\b|रिपोर्ट|शिकायत|मामला|टिकट/iu;
  return statusTerms.test(normalized) && reportTerms.test(normalized);
};
