import {
  normalizeLanguageCode,
  type VoiceAudio,
  type VoiceFetch,
  type VoiceInput,
  type VoiceProvider,
  type VoiceSynthesisInput,
  type VoiceTranscription,
} from "./voice.js";

export type SarvamVoiceProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: VoiceFetch;
  speaker?: string;
  outputAudioCodec?: "mp3" | "wav" | "ogg" | "opus";
};

export const voiceEnvironmentKeys = ["SARVAM_API_KEY"] as const;

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | undefined => (
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined
);

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const providerError = (operation: string, status: number): Error => new Error(`Sarvam ${operation} failed with HTTP ${status}.`);

/** Thin fetch-based adapter for the Saaras v3 and Bulbul v3 REST APIs. */
export class SarvamVoiceProvider implements VoiceProvider {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: VoiceFetch;
  readonly #speaker: string;
  readonly #outputAudioCodec: NonNullable<SarvamVoiceProviderOptions["outputAudioCodec"]>;

  constructor(options: SarvamVoiceProviderOptions) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = options.baseUrl ?? "https://api.sarvam.ai";
    this.#fetch = options.fetch ?? fetch;
    this.#speaker = options.speaker ?? "shubh";
    this.#outputAudioCodec = options.outputAudioCodec ?? "mp3";
  }

  async transcribe(input: VoiceInput): Promise<VoiceTranscription> {
    if (!this.#apiKey) throw new Error("Sarvam API key is not configured.");
    const form = new FormData();
    form.set("file", new Blob([input.data], { type: input.mediaType }), input.fileName ?? "voice-note");
    form.set("model", "saaras:v3");
    form.set("mode", "codemix");

    const response = await this.#fetch(`${this.#baseUrl}/speech-to-text`, {
      method: "POST",
      headers: { "api-subscription-key": this.#apiKey },
      body: form,
    });
    const body = await readJson(response);
    if (!response.ok) throw providerError("speech-to-text", response.status);
    const record = asRecord(body);
    const transcript = typeof record?.transcript === "string" ? record.transcript.trim() : "";
    if (!transcript) return { status: "unintelligible" };
    const languageCode = normalizeLanguageCode(record?.language_code);
    if (!languageCode) return { status: "language_unknown" };
    return { status: "transcribed", transcript, languageCode };
  }

  async synthesize(input: VoiceSynthesisInput): Promise<VoiceAudio> {
    if (!this.#apiKey) throw new Error("Sarvam API key is not configured.");
    const languageCode = normalizeLanguageCode(input.languageCode);
    if (!languageCode) throw new Error("A supported synthesis language code is required.");
    const response = await this.#fetch(`${this.#baseUrl}/text-to-speech`, {
      method: "POST",
      headers: { "api-subscription-key": this.#apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        target_language_code: languageCode,
        model: "bulbul:v3",
        speaker: this.#speaker,
        output_audio_codec: this.#outputAudioCodec,
      }),
    });
    const body = await readJson(response);
    if (!response.ok) throw providerError("text-to-speech", response.status);
    const audios = asRecord(body)?.audios;
    if (!Array.isArray(audios) || audios.some((audio) => typeof audio !== "string")) {
      throw new Error("Sarvam text-to-speech returned no audio.");
    }
    const encoded = audios.join("");
    const data = Buffer.from(encoded, "base64");
    if (data.byteLength === 0) throw new Error("Sarvam text-to-speech returned empty audio.");
    const mediaType = this.#outputAudioCodec === "mp3" ? "audio/mpeg" : this.#outputAudioCodec === "wav" ? "audio/wav" : "audio/ogg";
    const extension = this.#outputAudioCodec === "opus" ? "ogg" : this.#outputAudioCodec;
    return { data, mediaType, languageCode, fileName: `effi-response.${extension}` };
  }
}

export const sarvamVoiceProvider = new SarvamVoiceProvider({
  apiKey: process.env.SARVAM_API_KEY ?? "",
});
