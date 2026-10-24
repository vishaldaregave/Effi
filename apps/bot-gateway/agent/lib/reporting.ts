import { randomBytes } from "node:crypto";
import type { ToolContext } from "eve/tools";
import { SharedReportIngress } from "../../src/report-ingress.js";
import { ConvexReportStore } from "../../src/convex-report-store.js";
import { FileEvidenceStorage } from "../../src/evidence-storage.js";
import {
  SimulatedReportStore,
  type Channel,
} from "../../src/simulated-report-registration.js";
import { FileMediaStorage } from "../../src/whatsapp-persistence.js";
import { AppReportMediaStore } from "../../src/app-report-media.js";

const getAuthenticationBaseUrl = () => {
  const envUrl = process.env.EFFI_AUTHENTICATION_BASE_URL;
  if (envUrl && !envUrl.includes("localhost")) {
    return envUrl;
  }
  return "https://officer-dashboard-six.vercel.app/effi/auth";
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export type ReportConversation = { channel: Channel; conversationId: string };

/**
 * These are the only citizen-facing messages sent after confirmation. The
 * server owns the link's secret, expiry, and claim state; the gateway must
 * treat the URL as opaque and never interpolate report details into it.
 */
export const pendingSubmissionDelivery = (
  authenticationLink: string,
): { recipientMessage: string } => {
  const targetLink = authenticationLink.replace(
    /^https?:\/\/localhost(:\d+)?\/effi\/auth/,
    getAuthenticationBaseUrl().replace(/\/$/, ""),
  );
  return {
    recipientMessage: `Your report is ready. Complete registration here: ${targetLink}`,
  };
};

const conversationForAuth = (auth: unknown): ReportConversation | undefined => {
  if (!auth || !isRecord(auth) || !isRecord(auth.attributes)) return undefined;
  if (
    auth.authenticator === "telegram-webhook" &&
    (typeof auth.attributes.chat_id === "string" || typeof auth.attributes.chat_id === "number")
  ) {
    const chatId = String(auth.attributes.chat_id);
    const threadId =
      typeof auth.attributes.message_thread_id === "string" || typeof auth.attributes.message_thread_id === "number"
        ? String(auth.attributes.message_thread_id)
        : undefined;
    return {
      channel: "telegram",
      conversationId: threadId
        ? `${chatId}:${threadId}`
        : chatId,
    };
  }
  if (
    auth.authenticator === "whatsapp-baileys" &&
    typeof auth.attributes.conversation_id === "string"
  ) {
    return {
      channel: "whatsapp",
      conversationId: auth.attributes.conversation_id,
    };
  }
  return undefined;
};

export const reportConversationFromContext = (
  ctx: ToolContext,
): ReportConversation => {
  // A tool approval continuation may replace `current` with the approver's
  // auth, so bind the report to the conversation's original citizen.
  const conversation =
    conversationForAuth(ctx.session.auth.initiator) ??
    conversationForAuth(ctx.session.auth.current);
  if (!conversation)
    throw new Error(
      "This reporting tool requires a supported channel conversation.",
    );
  return conversation;
};

export const reportConversationFromAuth = (
  auth: ToolContext["session"]["auth"],
): ReportConversation | undefined =>
  conversationForAuth(auth.initiator) ?? conversationForAuth(auth.current);

const globalReporting = globalThis as unknown as {
  __effi_report_store?: SimulatedReportStore;
};

export const reportStore = (globalReporting.__effi_report_store ??= new SimulatedReportStore(
  () => new Date().toISOString(),
  {
    get authenticationBaseUrl() {
      return getAuthenticationBaseUrl();
    },
    tokenFactory: () => randomBytes(24).toString("base64url"),
  },
));

if (globalReporting.__effi_report_store) {
  const store = globalReporting.__effi_report_store as unknown as {
    options?: { authenticationBaseUrl?: string };
  };
  if (store.options) {
    Object.defineProperty(store.options, "authenticationBaseUrl", {
      get: getAuthenticationBaseUrl,
      configurable: true,
      enumerable: true,
    });
  }
}

export const reportIngress = new SharedReportIngress(reportStore);

const convexUrl = process.env.CONVEX_URL;
const draftScopeSecret = process.env.EFFI_DRAFT_SCOPE_SECRET;
const convexServiceSecret = process.env.EFFI_GATEWAY_CONVEX_SECRET;
const telegramEvidenceStorage = new FileEvidenceStorage();
const whatsappEvidenceStorage = new FileMediaStorage(
  process.env.WHATSAPP_MEDIA_DIR ?? ".data/whatsapp-media",
);
export const durableReportStore =
  convexUrl && draftScopeSecret && convexServiceSecret
    ? new ConvexReportStore(
        convexUrl,
        draftScopeSecret,
        convexServiceSecret,
        async ({ channel, storageKey }) =>
          channel === "telegram"
            ? await telegramEvidenceStorage.read(storageKey)
            : await whatsappEvidenceStorage.read(storageKey),
      )
    : undefined;

export const appReportMediaStore =
  convexUrl && convexServiceSecret
    ? new AppReportMediaStore(convexUrl, convexServiceSecret)
    : undefined;
