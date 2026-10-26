import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent, defineDynamic } from "eve";
import { logVoiceEnvironmentStatus } from "../src/voice-environment.js";

logVoiceEnvironmentStatus();

const opencodeBaseUrl = process.env.OPENCODE_BASE_URL ?? "https://api.commandcode.ai/provider/v1";
const opencodeModel = process.env.OPENCODE_MODEL ?? "meta/muse-spark-1.3-contributor";
const geminiModel = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";

export default defineAgent({
  model: defineDynamic({
    events: {
      "step.started": (_event: unknown, ctx: { session: { id: string } }): any => {
        const apiKey = process.env.OPENCODE_API_KEY;
        if (apiKey) {
          const commandCode = createOpenAI({
            name: "commandcode",
            baseURL: opencodeBaseUrl,
            apiKey,
          });
          return {
            model: commandCode.responses(opencodeModel),
            modelContextWindowTokens: 1_048_576,
          };
        }

        const geminiApiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (geminiApiKey) {
          const google = createGoogleGenerativeAI({
            apiKey: geminiApiKey,
          });
          return {
            model: google(geminiModel),
            modelContextWindowTokens: 1_048_576,
          };
        }

        throw new Error("OPENCODE_API_KEY (or GEMINI_API_KEY) is required.");
      },
    },
  }),
  defaultTools: false,
});
