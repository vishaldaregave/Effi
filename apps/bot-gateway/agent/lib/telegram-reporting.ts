import {
  TelegramChannelAdapter,
  telegramConversationId,
  telegramLocation,
} from "../../src/telegram-channel-adapter.js";
import { FileEvidenceStorage, type EvidenceStorage } from "../../src/evidence-storage.js";
import { SharedReportIngress, type ReportIngressRecord } from "../../src/report-ingress.js";
import { type SimulatedReportStore, type InboundMessage } from "../../src/simulated-report-registration.js";
import { FileMessageDedupe, type ProviderMessageDedupe } from "../../src/whatsapp-persistence.js";
import type { TelegramMessage } from "eve/channels/telegram";
import { pendingVoiceMessage, transcribeInboundVoice, type VoiceProvider } from "../../src/voice.js";
import { reliableVoiceProvider } from "../../src/reliable-voice-provider.js";
import { createVideoObservationProvider } from "../../src/video-observation.js";
import { join } from "node:path";
import { durableReportStore, reportStore } from "./reporting.js";

const currentTime = () => new Date().toISOString();
const telegramMessageDate = (message: TelegramMessage): string => {
  const date = message.raw.date;
  return typeof date === "number" && Number.isFinite(date) ? new Date(date * 1_000).toISOString() : currentTime();
};

export const telegramReportStore = reportStore;

export type TelegramIngressRecord = ReportIngressRecord;

export class TelegramReportIngress {
  readonly store: SimulatedReportStore;
  readonly adapter: TelegramChannelAdapter;
  readonly voiceProvider: VoiceProvider;
  readonly #ingress: SharedReportIngress;
  readonly #messageDedupe: ProviderMessageDedupe;

  constructor(options: {
    store?: SimulatedReportStore;
    adapter?: TelegramChannelAdapter;
    storage?: EvidenceStorage;
    voiceProvider?: VoiceProvider;
    messageDedupe?: ProviderMessageDedupe;
  } = {}) {
    this.store = options.store ?? reportStore;
    this.#ingress = new SharedReportIngress(this.store);
    this.voiceProvider = options.voiceProvider ?? reliableVoiceProvider;
    this.#messageDedupe = options.messageDedupe ?? new FileMessageDedupe(
      process.env.TELEGRAM_MESSAGE_DEDUPE_PATH ?? join(".data", "telegram-message-ids.json"),
    );
    this.adapter = options.adapter ?? new TelegramChannelAdapter({
      botToken: () => process.env.TELEGRAM_BOT_TOKEN ?? "",
      webhookSecretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN ?? "",
      storage: options.storage ?? new FileEvidenceStorage(),
      videoObservation: createVideoObservationProvider(),
    });
  }

  async accept(message: TelegramMessage): Promise<TelegramIngressRecord | undefined> {
    const messageId = `telegram:${message.chat.id}:${message.messageId}`;
    if (!(await this.#messageDedupe.claim(messageId))) return undefined;

    try {
      const attachments = await this.adapter.stageAttachments(message);
      const stagedVoice = await this.adapter.stageVoice(message);
      const stagedVideo = await this.adapter.stageVideo(message);
      const conversationId = telegramConversationId(message);
      const location = telegramLocation(message);
      const text = message.text || message.caption;
      const inbound: InboundMessage = {
        id: messageId,
        channel: "telegram",
        conversationId,
        senderId: message.from?.id ?? message.chat.id,
        receivedAt: telegramMessageDate(message),
        ...(text ? { text } : {}),
        ...(attachments.length > 0 || stagedVoice || stagedVideo
          ? { attachments: [...attachments, ...(stagedVoice ? [stagedVoice.attachment] : []), ...(stagedVideo ? [stagedVideo] : [])] }
          : {}),
        ...(location ? { location } : {}),
      };

      const pendingInbound = stagedVoice ? pendingVoiceMessage(inbound, stagedVoice.attachment) : inbound;
      let accepted = durableReportStore
        ? await this.#ingress.acceptDurably(pendingInbound, durableReportStore)
        : this.#ingress.accept(pendingInbound);
      if (!accepted) {
        const existing = this.#ingress.acceptForDispatch(pendingInbound);
        if (existing?.persisted.voice?.status !== "pending") {
          await this.#messageDedupe.complete?.(messageId);
          return undefined;
        }
        accepted = existing;
      }
      const voiceInbound = stagedVoice
        ? await transcribeInboundVoice(pendingInbound, stagedVoice, this.voiceProvider, (error) => {
            console.warn("Effi Telegram voice transcription failed:", error instanceof Error ? error.message : String(error));
          })
        : pendingInbound;
      const enriched = stagedVoice
        ? durableReportStore
          ? await this.#ingress.enrichVoiceDurably(accepted, voiceInbound, durableReportStore)
          : this.#ingress.enrichVoice(accepted, voiceInbound)
        : accepted;
      await this.#messageDedupe.complete?.(messageId);
      return enriched;
    } catch (error) {
      await this.#messageDedupe.release?.(messageId);
      throw error;
    }
  }

  contextFor(record: TelegramIngressRecord): string {
    return this.#ingress.contextFor(record);
  }

  async cancelDurably(record: TelegramIngressRecord): Promise<boolean> {
    if (!durableReportStore) return this.store.cancelConversation(record.inbound.channel, record.inbound.conversationId);
    return await this.#ingress.cancelDurably(record, durableReportStore);
  }
}

export const telegramReportIngress = new TelegramReportIngress();
