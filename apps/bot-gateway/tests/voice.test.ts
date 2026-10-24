import { describe, expect, it, vi } from "vitest";
import {
  SUPPORTED_VOICE_LANGUAGES,
  VoiceConversationPreferences,
  detectTextLanguage,
  isReportReadyForReview,
  pendingVoiceMessage,
  resolveResponseLanguage,
  retryTransientOperation,
  synthesizeVoiceOrUndefined,
  transcribeInboundVoice,
  transientError,
  type VoiceFetch,
} from "../src/voice.js";
import { CartesiaVoiceProvider } from "../src/cartesia-voice-provider.js";
import { DeepgramVoiceProvider } from "../src/deepgram-voice-provider.js";
import { AiGatewayVoiceProvider } from "../src/ai-gateway-voice-provider.js";
import { sendTelegramVoice } from "../src/telegram-voice-delivery.js";
import { SharedReportIngress, SimulatedReportStore } from "../src/index.js";
import { checkVoiceEnvironment } from "../src/voice-environment.js";


const jsonResponse = (body: unknown): Response => Response.json(body);

describe("configured voice providers", () => {
  it("transcribes with the AI Gateway Whisper model and keeps the detected Indian language", async () => {
    const transcribe = vi.fn(async () => ({ text: "माझ्या रस्त्यावर मोठा खड्डा आहे", language: "mr" }));
    const provider = new AiGatewayVoiceProvider({ model: "openai/whisper-1", transcribe });

    await expect(provider.transcribe({
      data: Buffer.from("voice-bytes"),
      mediaType: "audio/ogg",
      fileName: "citizen-note.ogg",
    })).resolves.toEqual({
      status: "transcribed",
      transcript: "माझ्या रस्त्यावर मोठा खड्डा आहे",
      languageCode: "mr-IN",
    });
    expect(transcribe).toHaveBeenCalledWith({ model: "openai/whisper-1", audio: Buffer.from("voice-bytes") });
  });

  it("falls back to script detection when the gateway omits the detected language", async () => {
    const provider = new AiGatewayVoiceProvider({
      model: "openai/whisper-1",
      transcribe: async () => ({ text: "சாலையில் பெரிய குழி உள்ளது" }),
    });

    await expect(provider.transcribe({ data: Buffer.from("voice"), mediaType: "audio/ogg" }))
      .resolves.toMatchObject({ status: "transcribed", languageCode: "ta-IN" });
  });

  it("returns an explicit recovery status when the gateway finds no speech", async () => {
    const provider = new AiGatewayVoiceProvider({
      model: "openai/whisper-1",
      transcribe: async () => ({ text: "   ", language: "mr" }),
    });

    await expect(provider.transcribe({ data: Buffer.from("voice"), mediaType: "audio/ogg" }))
      .resolves.toEqual({ status: "unintelligible" });
  });

  it("transcribes a staged voice note with Deepgram Nova-3 and keeps the detected language", async () => {
    const transcribeFile = vi.fn(async () => ({
      results: {
        channels: [{
          detected_language: "hi",
          alternatives: [{ transcript: "सड़क पर बड़ा गड्ढा है" }],
        }],
      },
    }));
    const provider = new DeepgramVoiceProvider({ apiKey: "deepgram-test-key", transcribeFile });

    await expect(provider.transcribe({
      data: Buffer.from("voice-bytes"),
      mediaType: "audio/ogg",
      fileName: "citizen-note.ogg",
    })).resolves.toEqual({
      status: "transcribed",
      transcript: "सड़क पर बड़ा गड्ढा है",
      languageCode: "hi-IN",
    });
    expect(transcribeFile).toHaveBeenCalledWith(
      { data: Buffer.from("voice-bytes"), contentType: "audio/ogg" },
      { model: "nova-3", language: "multi", smart_format: true, punctuate: true },
    );
  });

  it("transcribes with Deepgram Nova-3 using an explicit requested language hint", async () => {
    const transcribeFile = vi.fn(async () => ({
      results: {
        channels: [{
          alternatives: [{ transcript: "रस्त्यावर खड्डा पडला आहे", languages: ["mr"] }],
        }],
      },
    }));
    const provider = new DeepgramVoiceProvider({ apiKey: "deepgram-test-key", transcribeFile });

    await expect(provider.transcribe({
      data: Buffer.from("voice-bytes"),
      mediaType: "audio/ogg",
      fileName: "citizen-note.ogg",
      languageCode: "mr-IN",
    })).resolves.toEqual({
      status: "transcribed",
      transcript: "रस्त्यावर खड्डा पडला आहे",
      languageCode: "mr-IN",
    });
    expect(transcribeFile).toHaveBeenCalledWith(
      { data: Buffer.from("voice-bytes"), contentType: "audio/ogg" },
      { model: "nova-3", language: "mr", smart_format: true, punctuate: true },
    );
  });

  it("corrects Deepgram language classification from hi to mr when Marathi markers are present", async () => {
    const transcribeFile = vi.fn(async () => ({
      results: {
        channels: [{
          detected_language: "hi",
          alternatives: [{ transcript: "मला एक खड्डा report करायचा आहे" }],
        }],
      },
    }));
    const provider = new DeepgramVoiceProvider({ apiKey: "deepgram-test-key", transcribeFile });

    await expect(provider.transcribe({
      data: Buffer.from("voice-bytes"),
      mediaType: "audio/ogg",
    })).resolves.toEqual({
      status: "transcribed",
      transcript: "मला एक खड्डा report करायचा आहे",
      languageCode: "mr-IN",
    });
  });

  it("returns an explicit recovery status when Deepgram finds no speech", async () => {
    const provider = new DeepgramVoiceProvider({
      apiKey: "deepgram-test-key",
      transcribeFile: async () => ({ results: { channels: [{ alternatives: [{ transcript: "" }] }] } }),
    });

    await expect(provider.transcribe({ data: Buffer.from("voice"), mediaType: "audio/ogg" }))
      .resolves.toEqual({ status: "unintelligible" });
  });

  it("generates Cartesia Sonic 3.6 audio without exposing encoded data to the channel", async () => {
    const generate = vi.fn(async () => new Response(Buffer.from("audio-bytes")));
    const provider = new CartesiaVoiceProvider({ apiKey: "cartesia-test-key", voiceId: "hindi-voice", generate });

    const audio = await provider.synthesize({ text: "कृपया फिर से बोलें।", languageCode: "hi-IN" });

    expect(generate).toHaveBeenCalledWith({
      transcript: "कृपया फिर से बोलें।",
      model_id: "sonic-3.6",
      voice: "hindi-voice",
      language: "hi",
      output_format: { container: "mp3", sample_rate: 44_100, bit_rate: 128_000 },
    });
    expect(audio).toMatchObject({ mediaType: "audio/mpeg", languageCode: "hi-IN", fileName: "effi-response.mp3" });
    expect(audio.data).toEqual(Buffer.from("audio-bytes"));
  });

  it("delivers the provider audio through Telegram's multipart sendVoice endpoint", async () => {
    const fetch: VoiceFetch = vi.fn(async (_input, init) => {
      expect(String(_input)).toBe("https://telegram.test/botbot-token/sendVoice");
      expect(init?.method).toBe("POST");
      const body = init?.body as FormData;
      expect(body.get("chat_id")).toBe("42");
      expect(body.get("message_thread_id")).toBe("77");
      expect((body.get("voice") as File).name).toBe("response.mp3");
      return jsonResponse({ ok: true });
    });

    await expect(sendTelegramVoice({
      botToken: "bot-token",
      apiBaseUrl: "https://telegram.test",
      fetch,
      chatId: "42",
      messageThreadId: 77,
      audio: { data: Buffer.from("audio"), mediaType: "audio/mpeg", languageCode: "en-IN", fileName: "response.mp3" },
    })).resolves.toBeUndefined();
  });
});

describe("voice language detection", () => {
  it("retries a transient provider operation only once", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce("recovered");

    await expect(retryTransientOperation(operation)).resolves.toBe("recovered");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("maps representative Indian scripts to stable synthesis language codes", () => {
    expect(detectTextLanguage("यह हिंदी शिकायत है")).toBe("hi-IN");
    expect(detectTextLanguage("এটি একটি অভিযোগ")).toBe("bn-IN");
    expect(detectTextLanguage("ৰাস্তাটো বেয়া হৈছে")).toBe("as-IN");
    expect(detectTextLanguage("शाळेजवळ रस्ता खराब आहे")).toBe("mr-IN");
    expect(detectTextLanguage("இது ஒரு புகார்")).toBe("ta-IN");
    expect(detectTextLanguage("سڑک خراب ہے")).toBe("ur-IN");
    expect(detectTextLanguage("The road is broken")).toBe("en-IN");
  });

  it("identifies a completed report state without depending on response wording", () => {
    expect(isReportReadyForReview({
      phase: "gathering",
      issue: "A pothole is outside the school.",
      location: { latitude: 12, longitude: 77 },
      acceptedEvidence: [{}],
    })).toBe(true);
    expect(isReportReadyForReview({
      phase: "authentication_pending",
      issue: "A pothole is outside the school.",
      location: { latitude: 12, longitude: 77 },
      acceptedEvidence: [{}],
    })).toBe(false);
  });
});

describe("staged voice ingress", () => {
  const inbound = {
    id: "voice-message-1",
    channel: "telegram" as const,
    conversationId: "42",
    senderId: "7",
    attachments: [{
      id: "voice-message-1-audio",
      kind: "audio" as const,
      mediaType: "audio/ogg",
      platformUrl: "telegram-file:voice-message-1-audio",
      platformReference: "telegram:file:voice-message-1-audio",
      storageKey: "effi/telegram/42/voice-message-1/voice-message-1-audio.audio",
    }],
    receivedAt: "2026-08-18T12:00:00.000Z",
  };

  it("persists the detected transcript and language metadata without treating audio as photo evidence", async () => {
    const pending = pendingVoiceMessage(inbound, inbound.attachments[0]!);
    const store = new SimulatedReportStore();
    const ingress = new SharedReportIngress(store);
    const accepted = ingress.accept(pending);
    expect(accepted?.persisted.voice?.status).toBe("pending");

    const enriched = await transcribeInboundVoice(pending, {
      attachment: inbound.attachments[0]!,
      data: Buffer.from("voice-bytes"),
      fileName: "voice.ogg",
    }, {
      async transcribe(input) {
        expect(input.mediaType).toBe("audio/ogg");
        return { status: "transcribed", transcript: "A pothole is outside the school.", languageCode: "en-IN" };
      },
      async synthesize() {
        throw new Error("not used");
      },
    });
    const record = ingress.enrichVoice(accepted!, enriched);

    expect(record?.persisted.voice).toMatchObject({
      attachmentId: "voice-message-1-audio",
      status: "transcribed",
      languageCode: "en-IN",
    });
    expect(record?.persisted.voiceTranscript).toBe("A pothole is outside the school.");
    expect(record?.persisted.attachments).toEqual([expect.objectContaining({ kind: "audio" })]);
    expect(record?.conversation.acceptedEvidence).toEqual([]);
    expect(ingress.contextFor(record!)).toContain("voice_transcript: A pothole is outside the school.");
  });

  it("does not preserve a guessed transcript after a provider failure", async () => {
    const enriched = await transcribeInboundVoice(inbound, {
      attachment: inbound.attachments[0]!,
      data: Buffer.from("voice-bytes"),
    }, {
      async transcribe() {
        throw new Error("provider unavailable");
      },
      async synthesize() {
        throw new Error("not used");
      },
    });

    expect(enriched.voice).toMatchObject({ status: "failed" });
    expect(enriched.voiceTranscript).toBeUndefined();
  });

  it("lets the latest voice turn switch the response preference independently of the report session", () => {
    const preferences = new VoiceConversationPreferences();
    preferences.remember({ channel: "whatsapp", conversationId: "thread-1", text: "The road is broken" });
    preferences.remember({ channel: "whatsapp", conversationId: "thread-1", inputModality: "voice", languageCode: "hi-IN" });

    expect(preferences.get("whatsapp", "thread-1")).toEqual({ modality: "voice", languageCode: "hi-IN" });
  });
});

describe("voice provider reliability and error handling", () => {
  it("treats empty audio as unintelligible without invoking AI Gateway", async () => {
    const transcribe = vi.fn();
    const provider = new AiGatewayVoiceProvider({ model: "openai/whisper-1", transcribe });

    const result = await provider.transcribe({ data: new Uint8Array(0), mediaType: "audio/ogg" });
    expect(result).toEqual({ status: "unintelligible" });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("throws an actionable error when AI Gateway is called without an API key", async () => {
    const prevKey = process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    try {
      const provider = new AiGatewayVoiceProvider({ model: "openai/whisper-1" });
      await expect(provider.transcribe({ data: Buffer.from("data"), mediaType: "audio/ogg" }))
        .rejects.toThrow("AI Gateway transcription is not configured. Set AI_GATEWAY_API_KEY.");
    } finally {
      if (prevKey !== undefined) process.env.AI_GATEWAY_API_KEY = prevKey;
    }
  });

  it("throws an actionable error when Cartesia credentials are not set", async () => {
    const provider = new CartesiaVoiceProvider({ apiKey: "", voiceId: "" });
    await expect(provider.synthesize({ text: "Hello", languageCode: "en-IN" }))
      .rejects.toThrow("Cartesia text-to-speech is not configured.");
  });

  it("rejects synthesis of empty text in Cartesia", async () => {
    const provider = new CartesiaVoiceProvider({ apiKey: "key", voiceId: "voice" });
    await expect(provider.synthesize({ text: "   ", languageCode: "en-IN" }))
      .rejects.toThrow("Cannot synthesize speech from empty text.");
  });

  it("throws when Cartesia returns empty audio bytes", async () => {
    const generate = vi.fn(async () => new Response(new Uint8Array(0)));
    const provider = new CartesiaVoiceProvider({ apiKey: "key", voiceId: "voice", generate });

    await expect(provider.synthesize({ text: "Hello", languageCode: "en-IN" }))
      .rejects.toThrow("Cartesia text-to-speech returned empty audio.");
  });

  it("throws when Cartesia returns an HTTP failure response", async () => {
    const generate = vi.fn(async () => new Response("error", { status: 400, statusText: "Bad Request" }));
    const provider = new CartesiaVoiceProvider({ apiKey: "key", voiceId: "voice", generate });

    await expect(provider.synthesize({ text: "Hello", languageCode: "en-IN" }))
      .rejects.toThrow("Cartesia text-to-speech failed with HTTP 400.");
  });

  it("falls back to undefined and invokes onError callback when voice synthesis fails", async () => {
    const provider = new CartesiaVoiceProvider({ apiKey: "", voiceId: "" });
    const onError = vi.fn();

    const result = await synthesizeVoiceOrUndefined(provider, { text: "Hello", languageCode: "en-IN" }, onError);
    expect(result).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("rejects empty audio data in Telegram voice delivery", async () => {
    await expect(sendTelegramVoice({
      botToken: "test-token",
      chatId: "123",
      audio: { data: Buffer.alloc(0), mediaType: "audio/mpeg", languageCode: "en-IN" },
    })).rejects.toThrow("Cannot deliver empty voice audio to Telegram.");
  });

  it("sanitizes Telegram bot token from delivery errors", async () => {
    const fetch: VoiceFetch = vi.fn(async () => {
      throw new Error("Connection failed to https://api.telegram.org/bot12345:secret-token/sendVoice");
    });

    await expect(sendTelegramVoice({
      botToken: "12345:secret-token",
      fetch,
      chatId: "123",
      audio: { data: Buffer.from("audio"), mediaType: "audio/mpeg", languageCode: "en-IN" },
    })).rejects.toThrow(/\[REDACTED_BOT_TOKEN\]/);
  });

  it("classifies transient vs permanent errors correctly", () => {
    expect(transientError(new Error("Request timeout"))).toBe(true);
    expect(transientError(new Error("Rate limit exceeded"))).toBe(true);
    expect(transientError({ status: 429 })).toBe(true);
    expect(transientError({ status: 503 })).toBe(true);
    expect(transientError({ status: 401 })).toBe(false);
    expect(transientError({ status: 403 })).toBe(false);
    expect(transientError(new Error("AI Gateway transcription is not configured."))).toBe(false);
    expect(transientError(new Error("Unauthorized"))).toBe(false);
  });

  it("validates voice environment configuration without exposing secret values", () => {
    const emptyStatus = checkVoiceEnvironment({});
    expect(emptyStatus.sttConfigured).toBe(false);
    expect(emptyStatus.ttsConfigured).toBe(false);
    expect(emptyStatus.missingVariables).toEqual(["DEEPGRAM_API_KEY (or AI_GATEWAY_API_KEY)", "CARTESIA_API_KEY", "CARTESIA_VOICE_ID"]);
    expect(emptyStatus.warnings).toHaveLength(3);

    const configuredStatus = checkVoiceEnvironment({
      AI_GATEWAY_API_KEY: "secret-key",
      CARTESIA_API_KEY: "secret-cartesia",
      CARTESIA_VOICE_ID: "voice-123",
    });
    expect(configuredStatus.sttConfigured).toBe(true);
    expect(configuredStatus.ttsConfigured).toBe(true);
    expect(configuredStatus.missingVariables).toHaveLength(0);
    expect(configuredStatus.warnings).toHaveLength(0);
  });
});

describe("multilingual contract and voice routing", () => {
  it("defines genuine supported languages", () => {
    expect(SUPPORTED_VOICE_LANGUAGES).toEqual(["hi-IN", "mr-IN", "en-IN"]);
  });

  it("resolves user preferred language overriding detected language", () => {
    expect(resolveResponseLanguage("mr-IN", "hi-IN")).toBe("mr-IN");
    expect(resolveResponseLanguage("hi-IN", "en-IN")).toBe("hi-IN");
    expect(resolveResponseLanguage("en-IN", "mr-IN")).toBe("en-IN");
  });

  it("resolves auto-detection when a supported language is detected", () => {
    expect(resolveResponseLanguage("auto", "mr-IN")).toBe("mr-IN");
    expect(resolveResponseLanguage("auto", "hi-IN")).toBe("hi-IN");
    expect(resolveResponseLanguage("auto", "en-IN")).toBe("en-IN");
    expect(resolveResponseLanguage("auto", "mr")).toBe("mr-IN");
    expect(resolveResponseLanguage("auto", "hi")).toBe("hi-IN");
    expect(resolveResponseLanguage("auto", "en")).toBe("en-IN");
  });

  it("returns undefined for auto-detection when language is undetected or unsupported", () => {
    expect(resolveResponseLanguage("auto", undefined)).toBeUndefined();
    expect(resolveResponseLanguage("auto", "")).toBeUndefined();
    expect(resolveResponseLanguage("auto", "fr-FR")).toBeUndefined();
    expect(detectTextLanguage("1234567890 ???")).toBeUndefined();
    expect(detectTextLanguage("")).toBeUndefined();
  });

  it("preserves the original transcript and detects Marathi from text with distinct characters", () => {
    const marathiText = "शाळेजवळ मोठा खड्डा पडला आहे";
    expect(detectTextLanguage(marathiText)).toBe("mr-IN");
  });

  it("Cartesia selects Marathi voice when languageCode is Marathi", async () => {
    const generate = vi.fn(async () => new Response(Buffer.from("audio-bytes")));
    const provider = new CartesiaVoiceProvider({
      apiKey: "cartesia-key",
      voiceId: "hindi-default-voice",
      generate,
    });

    const audio = await provider.synthesize({
      text: "रस्ता दुरुस्त केला जाईल.",
      languageCode: "mr-IN",
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "mr",
        voice: "5c32dce6-936a-4892-b131-bafe474afe5f",
      }),
    );
    expect(audio.languageCode).toBe("mr-IN");
  });

  it("Cartesia rejects unsupported languages rather than faking another language", async () => {
    const provider = new CartesiaVoiceProvider({
      apiKey: "cartesia-key",
      voiceId: "default-voice",
    });

    await expect(
      provider.synthesize({
        text: "道路に穴があります",
        languageCode: "ja-JP",
      }),
    ).rejects.toThrow(/does not support language: ja-JP/);
  });
});

