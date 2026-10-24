import { createGateway } from "@ai-sdk/gateway";
import { transcribe } from "ai";
import {
  detectTextLanguage,
  normalizeLanguageCode,
  type VoiceInput,
  type VoiceTranscription,
} from "./voice.js";

type GatewayTranscription = (input: { model: string; audio: Uint8Array }) => Promise<{
  text: string;
  language?: string | undefined;
}>;

export type AiGatewayVoiceProviderOptions = {
  model: string;
  apiKey?: string | undefined;
  transcribe?: GatewayTranscription;
};

/** Vercel AI Gateway transcription (OpenAI Whisper) with language detection for voice notes. */
export class AiGatewayVoiceProvider {
  readonly #model: string;
  readonly #apiKey: string | undefined;
  readonly #transcribe: GatewayTranscription;

  constructor(options: AiGatewayVoiceProviderOptions) {
    this.#model = options.model;
    this.#apiKey = options.apiKey;
    this.#transcribe = options.transcribe ?? (async ({ model, audio }) => {
      const apiKey = this.#apiKey ?? process.env.AI_GATEWAY_API_KEY;
      if (!apiKey) throw new Error("AI Gateway transcription is not configured. Set AI_GATEWAY_API_KEY.");
      const gw = createGateway({ apiKey });
      const result = await transcribe({ model: gw.transcription(model), audio });
      return { text: result.text, language: result.language };
    });
  }

  async transcribe(input: VoiceInput): Promise<VoiceTranscription> {
    if (!input.data || input.data.byteLength === 0) {
      return { status: "unintelligible" };
    }
    const result = await this.#transcribe({ model: this.#model, audio: input.data });
    const transcript = result.text.trim();
    if (!transcript) return { status: "unintelligible" };
    const languageCode = normalizeLanguageCode(result.language) ?? detectTextLanguage(transcript);
    return { status: "transcribed", transcript, languageCode };
  }
}

export const aiGatewayVoiceProvider = new AiGatewayVoiceProvider({
  model: process.env.AI_GATEWAY_TRANSCRIPTION_MODEL ?? "openai/whisper-1",
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

