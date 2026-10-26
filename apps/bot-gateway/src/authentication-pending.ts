import type { Channel, SimulatedReportStore } from "./simulated-report-registration.js";

export const authenticationPendingReply =
  "Your report is ready. Complete the authentication link to register it.";

export const isAuthenticationPending = (
  store: SimulatedReportStore,
  channel: Channel,
  conversationId: string,
): boolean => store.activeConversation(channel, conversationId)?.phase === "authentication_pending";
