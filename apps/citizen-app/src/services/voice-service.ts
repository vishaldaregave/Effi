export type SupportedLanguageCode = "hi-IN" | "mr-IN" | "en-IN";
export type PreferredResponseLanguage = SupportedLanguageCode | "auto";

export type TranscriptionResult =
  | {
      ok: true;
      status: "transcribed";
      transcript: string;
      originalTranscript: string;
      detectedLanguage?: string | null | undefined;
      languageCode?: string | undefined;
    }
  | { ok: true; status: "unintelligible"; transcript: ""; originalTranscript: ""; detectedLanguage?: null }
  | { ok: false; status?: string | undefined; error: string; unsupportedLanguage?: boolean | undefined };

export type VoiceServiceStatus = {
  ok: boolean;
  sttConfigured: boolean;
  sttModel?: string | undefined;
  ttsConfigured: boolean;
  ttsVoiceId?: string | undefined;
  supportedSttLanguages?: readonly string[] | undefined;
  supportedTtsLanguages?: readonly string[] | undefined;
};

const REQUEST_TIMEOUT_MS = 25000;

export async function checkGatewayVoiceStatus(gatewayHost: string): Promise<VoiceServiceStatus> {
  const host = gatewayHost.replace(/\/+$/, "");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(`${host}/api/voice/status`, {
      method: "GET",
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      return { ok: false, sttConfigured: false, ttsConfigured: false };
    }
    const data = (await response.json()) as {
      ok?: boolean;
      sttConfigured?: boolean;
      sttModel?: string;
      ttsConfigured?: boolean;
      ttsVoiceId?: string;
      supportedSttLanguages?: string[];
      supportedTtsLanguages?: string[];
    };
    return {
      ok: Boolean(data.ok),
      sttConfigured: Boolean(data.sttConfigured),
      sttModel: data.sttModel,
      ttsConfigured: Boolean(data.ttsConfigured),
      ttsVoiceId: data.ttsVoiceId,
      supportedSttLanguages: data.supportedSttLanguages,
      supportedTtsLanguages: data.supportedTtsLanguages,
    };
  } catch {
    return { ok: false, sttConfigured: false, ttsConfigured: false };
  }
}

export async function transcribeAudioFile(options: {
  gatewayHost: string;
  fileUri: string;
  token?: string | null | undefined;
}): Promise<TranscriptionResult> {
  const host = options.gatewayHost.replace(/\/+$/, "");

  try {
    const isReactNative =
      (typeof globalThis !== "undefined" &&
        typeof (globalThis as { navigator?: { product?: string } }).navigator !==
          "undefined" &&
        (globalThis as { navigator?: { product?: string } }).navigator
          ?.product === "ReactNative") ||
      Boolean(
        (globalThis as Record<string, unknown>).nativeExtensions ||
          (globalThis as Record<string, unknown>).RN$NativeModules ||
          (globalThis as Record<string, unknown>).NativeModules,
      );

    let audioBody: any;
    if (isReactNative) {
      try {
        const localFile = await fetch(options.fileUri);
        if (localFile.ok && typeof localFile.blob === "function") {
          audioBody = await localFile.blob();
        } else {
          audioBody = new Blob([], { type: "audio/m4a" } as any);
        }
      } catch {
        audioBody = new Blob([], { type: "audio/m4a" } as any);
      }
    } else {
      audioBody = new Blob([], { type: "audio/m4a" } as any);
    }

    const headers: Record<string, string> = {
      "content-type": "audio/m4a",
    };
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(`${host}/api/voice/transcribe`, {
      method: "POST",
      headers,
      body: audioBody,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    let data: {
      ok?: boolean;
      status?: string;
      transcript?: string;
      originalTranscript?: string;
      detectedLanguage?: string | null;
      languageCode?: string;
      error?: string;
    };

    try {
      data = (await response.json()) as typeof data;
    } catch {
      return {
        ok: false,
        error: `Transcription service returned HTTP ${response.status}.`,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: data.status || "failed",
        error: data.error || `Voice transcription failed with HTTP ${response.status}.`,
      };
    }

    if (data.status === "unintelligible") {
      return {
        ok: true,
        status: "unintelligible",
        transcript: "",
        originalTranscript: "",
        detectedLanguage: null,
      };
    }

    if (data.status === "transcribed" && typeof data.transcript === "string") {
      const text = data.transcript.trim();
      return {
        ok: true,
        status: "transcribed",
        transcript: text,
        originalTranscript: data.originalTranscript?.trim() || text,
        detectedLanguage: data.detectedLanguage ?? data.languageCode ?? null,
        languageCode: data.languageCode,
      };
    }

    return {
      ok: false,
      status: "failed",
      error: data.error || "Unable to transcribe audio. Please try speaking clearly or typing.",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        error: "Voice transcription timed out. Please check your network and try again.",
      };
    }
    const message = error instanceof Error ? error.message : "Network error during transcription.";
    return {
      ok: false,
      error: message,
    };
  }
}

export function getSynthesisAudioUrl(gatewayHost: string, text: string, languageCode = "hi-IN"): string {
  const host = gatewayHost.replace(/\/+$/, "");
  const params = new URLSearchParams({
    text: text.trim().slice(0, 1500),
    languageCode,
  });
  return `${host}/api/voice/synthesize?${params.toString()}`;
}

const marathiDevanagariWordPattern = /(?:^|[^\p{Script=Devanagari}])(?:आहे|आहेत|नाही|नाहीत|मला|त्याला|त्यांना|माझ्या|माझे|माझी|माझा|आमच्या|करायचा|करायची|करायचे|करायचं|करा|झाला|झाली|झाले|पडला|पडली|पडले|पाहिजे|खूप|मोठा|मोठी|मोठे|आणि|काय|कसे|कधी|कुठे|येथे|तिथे|इथे|खड्डा|खड्ड्याला)(?:$|[^\p{Script=Devanagari}])/u;

export function detectTextLanguage(text: string): SupportedLanguageCode | undefined {
  if (/[ळऴऍॲ]/u.test(text) || marathiDevanagariWordPattern.test(text)) return "mr-IN";
  if (/[ऀ-ॿ]/u.test(text)) return "hi-IN";
  if (/[a-zA-Z]/u.test(text)) return "en-IN";
  return undefined;
}
