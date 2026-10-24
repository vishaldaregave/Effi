import { defineChannel, GET, OPTIONS, POST } from "eve/channels";
import { reliableVoiceProvider } from "../../src/reliable-voice-provider.js";
import { checkVoiceEnvironment } from "../../src/voice-environment.js";

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
};

const jsonResponse = (data: unknown, status = 200): Response => (
  Response.json(data, {
    status,
    headers: corsHeaders,
  })
);

export default defineChannel({
  routes: [
    OPTIONS("/api/voice/status", async () => new Response(null, { status: 204, headers: corsHeaders })),
    OPTIONS("/api/voice/transcribe", async () => new Response(null, { status: 204, headers: corsHeaders })),
    OPTIONS("/api/voice/synthesize", async () => new Response(null, { status: 204, headers: corsHeaders })),

    GET("/api/voice/status", async () => {
      const env = checkVoiceEnvironment();
      return jsonResponse({
        ok: true,
        sttConfigured: env.sttConfigured,
        sttModel: env.sttModel,
        ttsConfigured: env.ttsConfigured,
        ttsVoiceId: env.ttsVoiceId,
        supportedSttLanguages: ["hi-IN", "mr-IN", "en-IN"],
        supportedTtsLanguages: ["hi-IN", "mr-IN", "en-IN"],
      });
    }),

    POST("/api/voice/transcribe", async (request) => {
      const env = checkVoiceEnvironment();
      if (!env.sttConfigured) {
        return jsonResponse(
          {
            ok: false,
            status: "failed",
            error: "Speech-to-text service is not configured on the server. DEEPGRAM_API_KEY or AI_GATEWAY_API_KEY is required.",
          },
          503,
        );
      }

      const contentType = request.headers.get("content-type") || "";
      let audioBytes: Uint8Array;
      let mediaType = "audio/m4a";
      let fileName = "recording.m4a";
      let languageCode: string | undefined;

      const url = new URL(request.url);
      const queryLang = url.searchParams.get("language") || url.searchParams.get("languageCode");
      if (queryLang) languageCode = queryLang;

      try {
        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const formLang = formData.get("language") || formData.get("languageCode");
          if (typeof formLang === "string" && formLang) languageCode = formLang;
          const audioEntry = formData.get("audio");
          if (!audioEntry || !(audioEntry instanceof Blob)) {
            return jsonResponse({ ok: false, error: "No audio file provided in form data." }, 400);
          }
          audioBytes = new Uint8Array(await audioEntry.arrayBuffer());
          mediaType = audioEntry.type || mediaType;
          if ("name" in audioEntry && typeof audioEntry.name === "string" && audioEntry.name) {
            fileName = audioEntry.name;
          }
        } else {
          audioBytes = new Uint8Array(await request.arrayBuffer());
          mediaType = contentType.split(";")[0] || mediaType;
        }
      } catch {
        return jsonResponse({ ok: false, error: "Failed to read audio payload." }, 400);
      }

      if (audioBytes.byteLength === 0) {
        return jsonResponse({ ok: false, error: "Audio data is empty.", status: "unintelligible" }, 400);
      }

      const maxBytes = 15 * 1024 * 1024;
      if (audioBytes.byteLength > maxBytes) {
        return jsonResponse({ ok: false, error: "Audio data exceeds maximum size limit (15MB)." }, 413);
      }

      console.log(`[voice-api] Incoming audio: ${audioBytes.byteLength} bytes, type: ${mediaType}, lang: ${languageCode ?? "auto"}`);

      try {
        const result = await reliableVoiceProvider.transcribe({
          data: audioBytes,
          mediaType,
          fileName,
          ...(languageCode ? { languageCode } : {}),
        });
        console.log(`[voice-api] Transcription result:`, JSON.stringify(result));

        if (result.status === "transcribed" && result.transcript) {
          return jsonResponse({
            ok: true,
            status: "transcribed",
            transcript: result.transcript,
            originalTranscript: result.transcript,
            detectedLanguage: result.languageCode ?? null,
            languageCode: result.languageCode ?? undefined,
          });
        }

        return jsonResponse({
          ok: true,
          status: result.status,
          transcript: "",
          originalTranscript: "",
          detectedLanguage: result.languageCode ?? null,
          languageCode: result.languageCode ?? undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transcription failed.";
        return jsonResponse({ ok: false, error: message, status: "failed" }, 500);
      }
    }),

    GET("/api/voice/synthesize", async (request) => {
      const env = checkVoiceEnvironment();
      if (!env.ttsConfigured) {
        return jsonResponse(
          {
            ok: false,
            error: "Text-to-speech service is not configured on the server. CARTESIA_API_KEY and CARTESIA_VOICE_ID are required.",
          },
          503,
        );
      }

      const url = new URL(request.url);
      const text = url.searchParams.get("text")?.trim() ?? "";
      if (!text) {
        return jsonResponse({ ok: false, error: "Cannot synthesize empty text." }, 400);
      }

      if (text.length > 2000) {
        return jsonResponse({ ok: false, error: "Text exceeds maximum synthesis length of 2000 characters." }, 400);
      }

      const languageCode = url.searchParams.get("languageCode")?.trim() || "hi-IN";
      const baseLang = languageCode.split("-", 1)[0]?.toLowerCase();
      if (baseLang !== "hi" && baseLang !== "mr" && baseLang !== "en") {
        return jsonResponse(
          {
            ok: false,
            unsupportedLanguage: true,
            error: `Spoken response is not supported for language '${languageCode}'. Text responses are preserved.`,
          },
          422,
        );
      }

      try {
        const audio = await reliableVoiceProvider.synthesize({
          text,
          languageCode,
        });

        return new Response(audio.data, {
          status: 200,
          headers: {
            ...corsHeaders,
            "content-type": audio.mediaType,
            "content-length": String(audio.data.byteLength),
            "cache-control": "private, max-age=3600",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Speech synthesis failed.";
        return jsonResponse({ ok: false, error: message }, 500);
      }
    }),

    POST("/api/voice/synthesize", async (request) => {
      const env = checkVoiceEnvironment();
      if (!env.ttsConfigured) {
        return jsonResponse(
          {
            ok: false,
            error: "Text-to-speech service is not configured on the server. CARTESIA_API_KEY and CARTESIA_VOICE_ID are required.",
          },
          503,
        );
      }

      let body: { text?: unknown; languageCode?: unknown };
      try {
        body = await request.json() as typeof body;
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON request body." }, 400);
      }

      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        return jsonResponse({ ok: false, error: "Cannot synthesize empty text." }, 400);
      }

      if (text.length > 2000) {
        return jsonResponse({ ok: false, error: "Text exceeds maximum synthesis length of 2000 characters." }, 400);
      }

      const languageCode = typeof body.languageCode === "string" ? body.languageCode.trim() : "hi-IN";
      const baseLang = languageCode.split("-", 1)[0]?.toLowerCase();
      if (baseLang !== "hi" && baseLang !== "mr" && baseLang !== "en") {
        return jsonResponse(
          {
            ok: false,
            unsupportedLanguage: true,
            error: `Spoken response is not supported for language '${languageCode}'. Text responses are preserved.`,
          },
          422,
        );
      }

      try {
        const audio = await reliableVoiceProvider.synthesize({
          text,
          languageCode,
        });

        return new Response(audio.data, {
          status: 200,
          headers: {
            ...corsHeaders,
            "content-type": audio.mediaType,
            "content-length": String(audio.data.byteLength),
            "cache-control": "private, no-cache",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Speech synthesis failed.";
        return jsonResponse({ ok: false, error: message }, 500);
      }
    }),
  ],
});
