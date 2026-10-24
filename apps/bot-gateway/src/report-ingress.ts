import type {
  Conversation,
  InboundMessage,
  PersistedMessage,
  SimulatedReportStore,
} from "./simulated-report-registration.js";
import { voicePreferences } from "./voice.js";
import type { ConvexReportStore } from "./convex-report-store.js";

export type ReportIngressRecord = {
  readonly inbound: InboundMessage;
  readonly conversation: Conversation;
  readonly persisted: PersistedMessage;
};

export const draftCancellationReply = "Okay, I cancelled this complaint. Nothing was submitted. Send a new message whenever you want to start again.";

export const isDraftCancellationCommand = (inbound: Pick<InboundMessage, "text" | "voiceTranscript">): boolean => {
  const command = (inbound.text ?? inbound.voiceTranscript)?.trim().toLowerCase();
  return (
    command === "cancel" ||
    command === "/cancel" ||
    command === "start over" ||
    command === "new report" ||
    command === "reset" ||
    command === "/reset" ||
    command === "clear" ||
    command === "/clear" ||
    command === "restart" ||
    command === "/restart" ||
    command === "/start"
  );
};

/** Persist the normalized channel contract before an Eve model turn starts. */
export class SharedReportIngress {
  constructor(readonly store: SimulatedReportStore) {}

  accept(inbound: InboundMessage): ReportIngressRecord | undefined {
    if (this.store.hasPersistedMessage(inbound)) return undefined;
    let conversation = this.store.activeConversation(inbound.channel, inbound.conversationId);
    if (!conversation || conversation.phase === "registered" || conversation.phase === "cancelled") {
      conversation = this.store.startConversation(inbound);
    }
    const persisted = this.store.persistInbound(conversation, inbound);
    if (!persisted) return undefined;
    this.store.applyInboundFacts(conversation, persisted);
    voicePreferences.remember({
      channel: inbound.channel,
      conversationId: inbound.conversationId,
      ...(inbound.text === undefined ? {} : { text: inbound.text }),
      ...(inbound.voiceTranscript === undefined ? {} : { voiceTranscript: inbound.voiceTranscript }),
      inputModality: inbound.voice ? "voice" : "text",
      ...(inbound.voice?.languageCode ? { languageCode: inbound.voice.languageCode } : {}),
    });
    return { inbound, conversation, persisted };
  }

  /** The provider event is committed before this method returns model context. */
  async acceptDurably(inbound: InboundMessage, durableStore: ConvexReportStore): Promise<ReportIngressRecord | undefined> {
    const durable = await durableStore.persistInbound(inbound);
    this.store.restoreConversation(durable.messages.map((message) => message.payload).filter(isInboundMessage), durable.draft.phase, durable.draft.sessionId);
    return this.acceptForDispatch(inbound);
  }

  enrichVoice(record: ReportIngressRecord, inbound: InboundMessage): ReportIngressRecord {
    const persisted = this.store.enrichVoiceMessage(inbound);
    if (!persisted) return record;
    voicePreferences.remember({
      channel: inbound.channel,
      conversationId: inbound.conversationId,
      ...(inbound.text === undefined ? {} : { text: inbound.text }),
      ...(inbound.voiceTranscript === undefined ? {} : { voiceTranscript: inbound.voiceTranscript }),
      inputModality: "voice",
      ...(inbound.voice?.languageCode ? { languageCode: inbound.voice.languageCode } : {}),
    });
    return { inbound, conversation: record.conversation, persisted };
  }

  async enrichVoiceDurably(record: ReportIngressRecord, inbound: InboundMessage, durableStore: ConvexReportStore): Promise<ReportIngressRecord> {
    const enriched = this.enrichVoice(record, inbound);
    await durableStore.syncConversation(enriched.conversation);
    return enriched;
  }

  /** Cancelling is a gateway command; Convex then prevents this draft from ever resuming. */
  async cancelDurably(record: ReportIngressRecord, durableStore: ConvexReportStore): Promise<boolean> {
    const cancelled = await durableStore.cancelDraft(record.inbound);
    if (cancelled) this.store.cancelConversation(record.inbound.channel, record.inbound.conversationId);
    return cancelled;
  }

  /** Return an existing record when a downstream dispatch is being retried. */
  acceptForDispatch(inbound: InboundMessage): ReportIngressRecord | undefined {
    const accepted = this.accept(inbound);
    if (accepted) return accepted;
    const conversation = this.store.activeConversation(inbound.channel, inbound.conversationId);
    const persisted = this.store.persistedMessage(inbound.channel, inbound.conversationId, inbound.id);
    if (!conversation || conversation.phase === "registered" || conversation.phase === "cancelled" || !persisted) return undefined;
    return { inbound, conversation, persisted };
  }

  contextFor(record: ReportIngressRecord): string {
    const { inbound, persisted } = record;
    const channelName = inbound.channel === "telegram" ? "Telegram" : "WhatsApp";
    const lines = [
      `Effi has persisted this ${channelName} message before model processing.`,
      `${inbound.channel}_message_id: ${inbound.id}`,
      `conversation_id: ${inbound.conversationId}`,
    ];
    const responsePreference = voicePreferences.get(inbound.channel, inbound.conversationId);
    if (responsePreference) lines.push(`response_language: ${responsePreference.languageCode}`);
    if (inbound.location) {
      lines.push(`exact_location: ${inbound.location.latitude}, ${inbound.location.longitude} (${inbound.location.source})`);
      lines.push("Use only this exact location. A typed address or landmark is not a complete location.");
    }
    const images = persisted.attachments.filter((attachment) => attachment.kind === "image");
    if (images.length > 0) {
      lines.push(`effi_controlled_image_ids: ${images.map((attachment) => attachment.id).join(", ")}`);
      lines.push("Inspect the attached image before treating any image as accepted evidence.");
    }
    const videos = persisted.attachments.filter((attachment) => attachment.kind === "video");
    if (videos.length > 0) {
      lines.push(`effi_controlled_video_ids: ${videos.map((attachment) => attachment.id).join(", ")}`);
      for (const video of videos) {
        lines.push(`video_observation_${video.id}: ${video.observation ?? "unavailable"}`);
      }
      lines.push("The video observation is the visible content of that video. A video counts as the required photo evidence when the observation shows the reported issue.");
    }
    if (persisted.voice) {
      lines.push(`input_modality: voice`);
      lines.push(`voice_transcription_status: ${persisted.voice.status}`);
      lines.push(`voice_attachment_id: ${persisted.voice.attachmentId}`);
      if (persisted.voiceTranscript) {
        lines.push(`voice_transcript: ${persisted.voiceTranscript}`);
        lines.push("Treat the voice transcript as the citizen's description; do not ask them to repeat it unless the transcript is marked unintelligible or language_unknown.");
      }
    } else {
      lines.push("input_modality: text");
    }
    return lines.join("\n");
  }
}

const isInboundMessage = (value: unknown): value is InboundMessage => {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<InboundMessage>;
  return (message.channel === "telegram" || message.channel === "whatsapp")
    && typeof message.id === "string" && typeof message.conversationId === "string" && typeof message.senderId === "string"
    && typeof message.receivedAt === "string";
};
