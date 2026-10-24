import { retryTransientOperation, type VoiceAudio, type VoiceFetch } from "./voice.js";

export type TelegramVoiceDeliveryOptions = {
  botToken: string | (() => string | Promise<string>);
  apiBaseUrl?: string;
  fetch?: VoiceFetch;
  chatId: string;
  messageThreadId?: number;
  audio: VoiceAudio;
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const telegramToken = async (token: TelegramVoiceDeliveryOptions["botToken"]): Promise<string> =>
  typeof token === "function" ? token() : token;

const sanitizeTelegramError = (error: unknown, token: string): Error => {
  const message = error instanceof Error ? error.message : String(error);
  const clean = token ? message.replaceAll(token, "[REDACTED_BOT_TOKEN]") : message;
  return new Error(clean);
};

/** Sends generated audio through Telegram's multipart Bot API endpoint. */
export const sendTelegramVoice = async (options: TelegramVoiceDeliveryOptions): Promise<void> => {
  const token = await telegramToken(options.botToken);
  if (!token) throw new Error("Telegram bot token is not configured.");
  if (!options.audio?.data || options.audio.data.byteLength === 0) {
    throw new Error("Cannot deliver empty voice audio to Telegram.");
  }
  try {
    await retryTransientOperation(async () => {
      const form = new FormData();
      form.set("chat_id", options.chatId);
      if (options.messageThreadId !== undefined) form.set("message_thread_id", String(options.messageThreadId));
      form.set("voice", new Blob([options.audio.data], { type: options.audio.mediaType }), options.audio.fileName ?? "effi-response.mp3");

      const response = await (options.fetch ?? fetch)(
        `${options.apiBaseUrl ?? "https://api.telegram.org"}/bot${token}/sendVoice`,
        { method: "POST", body: form },
      );
      const body = await readJson(response);
      if (!response.ok || !isRecord(body) || body.ok !== true) {
        throw new Error(`Telegram voice delivery failed with HTTP ${response.status}.`);
      }
    });
  } catch (error) {
    throw sanitizeTelegramError(error, token);
  }
};

