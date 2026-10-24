import { defineTool, toolOutput, toolOutputPart } from "eve/tools";
import { z } from "zod";
import { durableReportStore, reportConversationFromContext, reportStore } from "../lib/reporting.js";
import { telegramReportIngress } from "../lib/telegram-reporting.js";
import { whatsappMediaStorage } from "../lib/whatsapp-reporting.js";

export default defineTool({
  description: "Inspect one image that Effi already copied into controlled storage. Call once to view it, then call again with an assessment after deciding whether it is usable civic evidence.",
  inputSchema: z.object({
    attachmentId: z.string().min(1),
    assessment: z.enum(["satisfactory", "insufficient"]).optional(),
  }),
  async execute({ attachmentId, assessment }, ctx) {
    const { channel, conversationId } = reportConversationFromContext(ctx);
    const attachment = reportStore.attachment(channel, conversationId, attachmentId);
    if (!attachment) throw new Error("The staged image is not present in this channel conversation.");

    if (assessment) {
      reportStore.recordAttachmentQuality(channel, conversationId, attachmentId, assessment);
    } else {
      reportStore.markAttachmentInspected(channel, conversationId, attachmentId);
    }
    const conversation = reportStore.activeConversation(channel, conversationId);
    if (conversation && durableReportStore) await durableReportStore.syncConversation(conversation);

    const updatedAttachment = reportStore.attachment(channel, conversationId, attachmentId);
    if (!updatedAttachment) throw new Error("The staged image is not present in this channel conversation.");
    const bytes = channel === "telegram"
      ? await telegramReportIngress.adapter.storage.read(updatedAttachment.storageKey)
      : await whatsappMediaStorage.read(updatedAttachment.storageKey);
    return {
      attachmentId: updatedAttachment.id,
      mediaType: updatedAttachment.mediaType,
      storageKey: updatedAttachment.storageKey,
      base64: Buffer.from(bytes).toString("base64"),
    };
  },
  toModelOutput(output) {
    return toolOutput.content([
      toolOutputPart.text(`Inspect staged image ${output.attachmentId} from Effi-controlled storage.`),
      toolOutputPart.file(output.base64, { mediaType: output.mediaType }),
    ]);
  },
});
