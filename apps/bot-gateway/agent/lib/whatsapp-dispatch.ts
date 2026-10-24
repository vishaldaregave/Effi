import type { AgentUserContent } from "../../src/whatsapp-channel.js";

const internalRoute = "/effi/v1/whatsapp/socket-inbound";

const serializableInput = (input: string | AgentUserContent): string | AgentUserContent => {
  if (typeof input === "string") return input;
  return input.map((part) => {
    if (part.type !== "file" || !Buffer.isBuffer(part.data)) return part;
    return { ...part, data: part.data.toString("base64") };
  });
};

/** Re-enter Eve through a route context because Baileys events originate on a socket. */
export const dispatchWhatsAppTurn = async (
  input: string | AgentUserContent,
  context: { messageId: string; principalId: string; threadId: string },
): Promise<void> => {
  const baseUrl = process.env.EFFI_INTERNAL_BASE_URL ?? "http://127.0.0.1:3000";
  const secret = process.env.EFFI_INTERNAL_DISPATCH_SECRET;
  if (!secret) throw new Error("EFFI_INTERNAL_DISPATCH_SECRET is required for WhatsApp socket dispatch.");
  const response = await fetch(new URL(internalRoute, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", "x-effi-internal-dispatch-secret": secret },
    body: JSON.stringify({ ...context, input: serializableInput(input) }),
  });
  if (!response.ok) throw new Error(`WhatsApp Eve dispatch failed with status ${response.status}.`);
};
