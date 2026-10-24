import { Cartesia } from "@cartesia/cartesia-js";
import type { VoiceAudio, VoiceSynthesisInput } from "./voice.js";

type CartesiaGenerate = (input: {
  model_id: "sonic-3.6";
  transcript: string;
  voice: string;
  language: string;
  output_format: { container: "mp3"; sample_rate: 44_100; bit_rate: 128_000 };
}) => Promise<Response>;

export type CartesiaVoiceProviderOptions = {
  apiKey?: string | undefined;
  voiceId?: string | undefined;
  generate?: CartesiaGenerate | undefined;
};

/** Cartesia Sonic 3.6 speech synthesis for Telegram and WhatsApp replies. */
export const CARTESIA_SUPPORTED_LANGUAGES = ["en", "hi", "mr", "bn", "gu", "ta", "te", "kn", "pa"] as const;

export class CartesiaVoiceProvider {
  readonly #apiKey: string | undefined;
  readonly #voiceId: string | undefined;
  readonly #generate: CartesiaGenerate | undefined;

  constructor(options: CartesiaVoiceProviderOptions = {}) {
    this.#apiKey = options.apiKey;
    this.#voiceId = options.voiceId;
    this.#generate = options.generate;
  }

  resolveVoiceId(languageCode: string): string | undefined {
    const baseLang = languageCode.split("-", 1)[0]?.toLowerCase() ?? languageCode.toLowerCase();
    if (baseLang === "mr") {
      return process.env.CARTESIA_MARATHI_VOICE_ID ?? "5c32dce6-936a-4892-b131-bafe474afe5f";
    }
    return this.#voiceId ?? process.env.CARTESIA_VOICE_ID;
  }

  async synthesize(input: VoiceSynthesisInput): Promise<VoiceAudio> {
    const apiKey = this.#apiKey ?? process.env.CARTESIA_API_KEY;
    const baseLang = input.languageCode.split("-", 1)[0]?.toLowerCase() ?? input.languageCode.toLowerCase();
    
    if (!(CARTESIA_SUPPORTED_LANGUAGES as readonly string[]).includes(baseLang)) {
      throw new Error(`Cartesia text-to-speech does not support language: ${input.languageCode}`);
    }

    const voiceId = this.resolveVoiceId(input.languageCode);
    if (!apiKey || !voiceId) {
      throw new Error("Cartesia text-to-speech is not configured. Set CARTESIA_API_KEY and CARTESIA_VOICE_ID.");
    }

    const text = input.text.trim();
    if (!text) throw new Error("Cannot synthesize speech from empty text.");

    const generate = this.#generate ?? ((request) => new Cartesia({ apiKey }).tts.generate(request));
    const response = await generate({
      transcript: text,
      model_id: "sonic-3.6",
      voice: voiceId,
      language: baseLang,
      output_format: { container: "mp3", sample_rate: 44_100, bit_rate: 128_000 },
    });
    if ("ok" in response && !response.ok) {
      throw new Error(`Cartesia text-to-speech failed with HTTP ${response.status}.`);
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength === 0) throw new Error("Cartesia text-to-speech returned empty audio.");
    return { data, mediaType: "audio/mpeg", languageCode: input.languageCode, fileName: "effi-response.mp3" };
  }
}

export const cartesiaVoiceProvider = new CartesiaVoiceProvider({
  apiKey: process.env.CARTESIA_API_KEY,
  voiceId: process.env.CARTESIA_VOICE_ID,
});

