import { DeepgramClient } from "@deepgram/sdk";
import {
  detectTextLanguage,
  normalizeLanguageCode,
  type VoiceInput,
  type VoiceTranscription,
} from "./voice.js";

type DeepgramTranscribeFile = (
  audio: { data: Buffer; contentType: string },
  options: {
    model: "nova-3";
    smart_format: true;
    punctuate: true;
    language?: string;
    detect_language?: boolean;
  },
) => Promise<unknown>;

export type DeepgramVoiceProviderOptions = {
  apiKey: string;
  transcribeFile?: DeepgramTranscribeFile;
};

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | undefined => (
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined
);

const firstItem = (value: unknown): unknown => Array.isArray(value) ? value[0] : undefined;

/** Deepgram Nova-3 transcription for Telegram and WhatsApp voice notes. */
export class DeepgramVoiceProvider {
  readonly #apiKey: string;
  readonly #transcribeFile: DeepgramTranscribeFile | undefined;

  constructor(options: DeepgramVoiceProviderOptions) {
    this.#apiKey = options.apiKey;
    this.#transcribeFile = options.transcribeFile;
  }

  async transcribe(input: VoiceInput): Promise<VoiceTranscription> {
    if (!this.#apiKey) throw new Error("Deepgram API key is not configured.");
    const transcribeFile = this.#transcribeFile ?? ((audio, options) => {
      const client = new DeepgramClient({ apiKey: this.#apiKey });
      return client.listen.v1.media.transcribeFile(audio, options);
    });

    const requestedLanguage = input.languageCode
      ? (input.languageCode.split("-", 1)[0]?.toLowerCase() ?? input.languageCode.toLowerCase())
      : undefined;
    const options = requestedLanguage && requestedLanguage !== "auto"
      ? { model: "nova-3" as const, language: requestedLanguage, smart_format: true as const, punctuate: true as const }
      : { model: "nova-3" as const, language: "multi", smart_format: true as const, punctuate: true as const };

    let response = asRecord(await transcribeFile(
      { data: Buffer.from(input.data), contentType: input.mediaType },
      options,
    ));
    let channel = asRecord(firstItem(asRecord(response?.results)?.channels));
    let alternative = asRecord(firstItem(channel?.alternatives));
    let transcript = typeof alternative?.transcript === "string" ? alternative.transcript.trim() : "";
    if (!transcript) return { status: "unintelligible" };

    let detectedLang = typeof channel?.detected_language === "string" ? channel.detected_language : undefined;
    let alternativeLangs = Array.isArray(alternative?.languages) ? alternative.languages : [];
    let firstAltLang = typeof alternativeLangs[0] === "string" ? alternativeLangs[0] : undefined;
    let rawLang = detectedLang ?? firstAltLang ?? (requestedLanguage && requestedLanguage !== "auto" ? requestedLanguage : undefined);

    const isSupportedLang = rawLang === "hi" || rawLang === "mr" || rawLang === "en" || rawLang === "hi-IN" || rawLang === "mr-IN" || rawLang === "en-IN";
    const hasForeignScript = /[؀-ۿͰ-Ͽ\u0400-\u04FF]/u.test(transcript);
    if ((!isSupportedLang || hasForeignScript) && (!requestedLanguage || requestedLanguage === "auto")) {
      const fallbackResponse = asRecord(await transcribeFile(
        { data: Buffer.from(input.data), contentType: input.mediaType },
        { model: "nova-3", language: "en", smart_format: true, punctuate: true },
      ).catch(() => undefined));
      const fbChannel = asRecord(firstItem(asRecord(fallbackResponse?.results)?.channels));
      const fbAlt = asRecord(firstItem(fbChannel?.alternatives));
      const fbTranscript = typeof fbAlt?.transcript === "string" ? fbAlt.transcript.trim() : "";
      if (fbTranscript) {
        response = fallbackResponse;
        channel = fbChannel;
        alternative = fbAlt;
        transcript = fbTranscript;
        rawLang = "en";
      }
    }

    const normalized = normalizeLanguageCode(rawLang);
    const textLang = detectTextLanguage(transcript);
    const languageCode = (normalized === "hi-IN" && textLang === "mr-IN")
      ? "mr-IN"
      : (normalized ?? textLang ?? "en-IN");

    return { status: "transcribed", transcript, languageCode };
  }
}

export const deepgramVoiceProvider = new DeepgramVoiceProvider({
  apiKey: process.env.DEEPGRAM_API_KEY ?? "",
});
