import { aiGatewayVoiceProvider } from "./ai-gateway-voice-provider.js";
import { deepgramVoiceProvider } from "./deepgram-voice-provider.js";
import { cartesiaVoiceProvider } from "./cartesia-voice-provider.js";
import { retryTransientOperation, type VoiceProvider } from "./voice.js";

export const reliableVoiceProvider: VoiceProvider = {
  transcribe: (input) =>
    retryTransientOperation(() => {
      if (process.env.DEEPGRAM_API_KEY) {
        return deepgramVoiceProvider.transcribe(input);
      }
      return aiGatewayVoiceProvider.transcribe(input);
    }),
  synthesize: (input) => retryTransientOperation(() => cartesiaVoiceProvider.synthesize(input)),
};
