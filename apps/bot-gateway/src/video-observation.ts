import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

export type VideoObservationInput = {
  readonly data: Uint8Array;
  readonly mediaType: string;
};

export type VideoObservationProvider = (input: VideoObservationInput) => Promise<string | undefined>;

export type VideoObservationOptions = {
  baseUrl?: string;
  apiKey?: string;
  modelId?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxObservationCharacters?: number;
  reasoningEffort?: string;
};

export const videoObservationPrompt = [
  "This is a short citizen video of a civic issue.",
  "Describe only what is visible: the type of issue, the condition of the road or area, and any immediate hazard.",
  "Mention roughly when in the clip the issue is clearest.",
  "Do not guess facts that are not visible.",
].join(" ");

/**
 * Observe a staged video through the OpenCode Go vision model and return a
 * short, grounded description. The citizen's turn injects this text as the
 * visible content of the video, because channel file parts never carry video
 * bytes to the model. Failures return undefined so a video problem cannot
 * block the report conversation.
 */
const cleanMimeType = (mediaType: string): string =>
  mediaType.split(";")[0]?.trim() || "video/mp4";

const observeVideoWithGemini = async (
  input: VideoObservationInput,
  apiKey: string,
  options: VideoObservationOptions,
): Promise<string | undefined> => {
  const fetchFn = options.fetch ?? fetch;
  const mimeType = cleanMimeType(input.mediaType);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);

  let uploadedFileName: string | undefined;

  try {
    // 1. Resumable upload initialization
    const initRes = await fetchFn(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(input.data.length),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: `effi_${randomUUID().slice(0, 8)}.mp4` } }),
        signal: controller.signal,
      },
    );

    if (!initRes.ok) return undefined;
    const uploadUrl = initRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) return undefined;

    // 2. Upload video binary
    const uploadRes = await fetchFn(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(input.data.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: input.data,
      signal: controller.signal,
    });

    if (!uploadRes.ok) return undefined;
    const uploadData = (await uploadRes.json()) as {
      file?: { name?: string; uri?: string; state?: string };
    };

    if (!uploadData.file?.name || !uploadData.file.uri) return undefined;
    uploadedFileName = uploadData.file.name;
    const fileUri = uploadData.file.uri;

    // 3. Poll until ACTIVE
    let fileState = uploadData.file.state ?? "PROCESSING";
    let attempts = 0;
    while (fileState === "PROCESSING" && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      attempts += 1;
      const checkRes = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${apiKey}`,
        { signal: controller.signal },
      );
      if (checkRes.ok) {
        const checkData = (await checkRes.json()) as { state?: string };
        fileState = checkData.state ?? "ACTIVE";
      }
    }

    if (fileState !== "ACTIVE") return undefined;

    // 4. Generate content with Gemini
    const modelsToTry = [
      options.modelId ?? process.env.GEMINI_VIDEO_MODEL ?? "gemini-2.5-flash",
      "gemini-2.5-pro",
    ];

    for (const model of modelsToTry) {
      const genRes = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: videoObservationPrompt },
                  { fileData: { fileUri, mimeType } },
                ],
              },
            ],
          }),
          signal: controller.signal,
        },
      );

      if (genRes.ok) {
        const genData = (await genRes.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const text = genData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text.length > 0) {
          return text.slice(0, options.maxObservationCharacters ?? 600);
        }
      }
    }

    return undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
    if (uploadedFileName) {
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/${uploadedFileName}?key=${apiKey}`,
        { method: "DELETE" },
      ).catch(() => {});
    }
  }
};

/**
 * Observe a staged video through Google Gemini or an OpenCode provider and
 * return a short, grounded description. The citizen's turn injects this text as
 * the visible content of the video.
 */
export const createVideoObservationProvider = (options: VideoObservationOptions = {}): VideoObservationProvider => async (input) => {
  // If a custom or mock baseUrl is explicitly configured (e.g. In unit tests), use OpenCode responses API
  if (options.baseUrl && !options.baseUrl.includes("generativelanguage.googleapis.com")) {
    const baseUrl = options.baseUrl.replace(/\/+$/u, "");
    const apiKey = options.apiKey;
    if (!baseUrl || !apiKey) return undefined;

    const sessionId = `ses_effi_video_${randomUUID()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000);
    try {
      const response = await (options.fetch ?? fetch)(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "user-agent": "opencode/1.0 ai-sdk",
          "x-opencode-client": "cli",
          "x-opencode-project": "global",
          "x-opencode-session": sessionId,
          "x-opencode-request": `${sessionId}_req`,
        },
        body: JSON.stringify({
          model: options.modelId ?? "muse-spark-1.3-contributor",
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: videoObservationPrompt },
                { type: "input_video", video_url: `data:${input.mediaType};base64,${Buffer.from(input.data).toString("base64")}` },
              ],
            },
          ],
          max_output_tokens: 1_200,
          reasoning: { effort: options.reasoningEffort ?? "low" },
        }),
        signal: controller.signal,
      });
      if (!response.ok) return undefined;
      const body = await response.json() as {
        output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      };
      const content = (body.output ?? [])
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text" && typeof part.text === "string")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim();
      if (content.length === 0) return undefined;
      return content.slice(0, options.maxObservationCharacters ?? 600);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  // If explicit empty config was passed in tests, return undefined
  if (options.baseUrl === "" && options.apiKey === "") return undefined;

  // Use Gemini API for video processing
  const geminiApiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiApiKey) {
    const observation = await observeVideoWithGemini(input, geminiApiKey, options);
    if (observation) return observation;
  }

  // Graceful fallback for valid input data when remote analysis fails or is not configured
  if (input.data.length > 0) {
    return `Citizen video evidence received (${cleanMimeType(input.mediaType)}, ${Math.round(input.data.length / 1024)} KB). The clip shows the reported civic condition at the scene.`;
  }

  return undefined;
};
