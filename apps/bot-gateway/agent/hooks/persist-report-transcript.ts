import { defineHook } from "eve/hooks";
import { durableReportStore, reportConversationFromAuth, reportStore } from "../lib/reporting.js";
import {
  completedMessageTranscriptEntry,
  inputRequestTranscriptEntries,
  type EffiTranscriptEntry,
} from "../lib/transcript.js";

const persistEntry = async (
  auth: Parameters<typeof reportConversationFromAuth>[0],
  entry: EffiTranscriptEntry,
): Promise<void> => {
  if (!durableReportStore) return;
  const reportConversation = reportConversationFromAuth(auth);
  if (!reportConversation) return;
  const conversation = reportStore.activeConversation(reportConversation.channel, reportConversation.conversationId);
  if (!conversation) return;
  const persisted = await durableReportStore.persistEffiTranscriptMessage({ conversation, ...entry });
  if (!persisted) {
    if (conversation.phase === "cancelled" || conversation.phase === "registered") return;
    throw new Error("The durable report draft is missing while persisting an Effi transcript entry.");
  }
};

export default defineHook({
  events: {
    async "message.completed"(event, ctx) {
      const entry = completedMessageTranscriptEntry(event);
      if (entry) await persistEntry(ctx.session.auth, entry);
    },
    async "input.requested"(event, ctx) {
      for (const entry of inputRequestTranscriptEntries(event)) {
        await persistEntry(ctx.session.auth, entry);
      }
    },
  },
});
