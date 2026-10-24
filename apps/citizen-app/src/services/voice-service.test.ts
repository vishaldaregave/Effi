import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkGatewayVoiceStatus,
  getSynthesisAudioUrl,
  transcribeAudioFile,
} from "./voice-service";

describe("voice-service", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getSynthesisAudioUrl", () => {
    it("builds the correct synthesis URL with query parameters", () => {
      const url = getSynthesisAudioUrl("http://localhost:2000/", "Namaste Bharat", "hi-IN");
      expect(url).toBe("http://localhost:2000/api/voice/synthesize?text=Namaste+Bharat&languageCode=hi-IN");
    });

    it("trims trailing slashes from the gateway host", () => {
      const url = getSynthesisAudioUrl("http://192.168.1.100:2000///", "Hello", "en-IN");
      expect(url).toBe("http://192.168.1.100:2000/api/voice/synthesize?text=Hello&languageCode=en-IN");
    });

    it("truncates text to 1500 characters", () => {
      const longText = "a".repeat(2000);
      const url = getSynthesisAudioUrl("http://localhost:2000", longText);
      const parsed = new URL(url);
      expect(parsed.searchParams.get("text")?.length).toBe(1500);
    });
  });

  describe("checkGatewayVoiceStatus", () => {
    it("parses healthy gateway status", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          sttConfigured: true,
          sttModel: "openai/whisper-1",
          ttsConfigured: true,
          ttsVoiceId: "hindi-voice-id",
        }),
      } as unknown as Response);

      const status = await checkGatewayVoiceStatus("http://localhost:2000");
      expect(status.ok).toBe(true);
      expect(status.sttConfigured).toBe(true);
      expect(status.sttModel).toBe("openai/whisper-1");
      expect(status.ttsConfigured).toBe(true);
      expect(status.ttsVoiceId).toBe("hindi-voice-id");
    });

    it("returns unconfigured status when request fails", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const status = await checkGatewayVoiceStatus("http://localhost:2000");
      expect(status.ok).toBe(false);
      expect(status.sttConfigured).toBe(false);
      expect(status.ttsConfigured).toBe(false);
    });
  });

  describe("transcribeAudioFile", () => {
    it("returns transcript on successful server response", async () => {
      let capturedHeaders: unknown;
      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            status: "transcribed",
            transcript: "Pothole on Main Road near Bus Stand",
            languageCode: "en",
          }),
        };
      });

      const result = await transcribeAudioFile({
        gatewayHost: "http://localhost:2000",
        fileUri: "file:///data/user/0/cache/audio.m4a",
        token: "test-auth-jwt",
      });

      expect(result).toEqual({
        ok: true,
        status: "transcribed",
        transcript: "Pothole on Main Road near Bus Stand",
        languageCode: "en",
        detectedLanguage: "en",
        originalTranscript: "Pothole on Main Road near Bus Stand",
      });
      expect(capturedHeaders).toEqual({
        "content-type": "audio/m4a",
        authorization: "Bearer test-auth-jwt",
      });
    });

    it("handles unintelligible audio gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          status: "unintelligible",
        }),
      } as unknown as Response);

      const result = await transcribeAudioFile({
        gatewayHost: "http://localhost:2000",
        fileUri: "file:///data/user/0/cache/silence.m4a",
      });

      expect(result).toEqual({
        ok: true,
        status: "unintelligible",
        transcript: "",
        detectedLanguage: null,
        originalTranscript: "",
      });
    });

    it("handles server-side 400 and error payloads", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          status: "empty_audio",
          error: "The recorded audio is empty or corrupt.",
        }),
      } as unknown as Response);

      const result = await transcribeAudioFile({
        gatewayHost: "http://localhost:2000",
        fileUri: "file:///data/user/0/cache/empty.m4a",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("The recorded audio is empty or corrupt.");
      }
    });

    it("handles network failure gracefully", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network request failed"));

      const result = await transcribeAudioFile({
        gatewayHost: "http://localhost:2000",
        fileUri: "file:///data/user/0/cache/audio.m4a",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Network request failed");
      }
    });
  });
});
