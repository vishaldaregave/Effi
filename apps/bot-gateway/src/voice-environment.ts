export type VoiceEnvironmentStatus = {
  sttConfigured: boolean;
  sttModel: string;
  ttsConfigured: boolean;
  ttsVoiceId: string | undefined;
  missingVariables: string[];
  warnings: string[];
};

export const checkVoiceEnvironment = (env: NodeJS.ProcessEnv = process.env): VoiceEnvironmentStatus => {
  const missingVariables: string[] = [];
  const warnings: string[] = [];

  const aiGatewayKey = env.AI_GATEWAY_API_KEY?.trim();
  const deepgramKey = env.DEEPGRAM_API_KEY?.trim();
  const sttConfigured = Boolean(aiGatewayKey || deepgramKey);
  const sttModel = aiGatewayKey
    ? (env.AI_GATEWAY_TRANSCRIPTION_MODEL?.trim() || "openai/whisper-1")
    : deepgramKey
    ? "deepgram/nova-3"
    : "none";

  if (!sttConfigured) {
    missingVariables.push("DEEPGRAM_API_KEY (or AI_GATEWAY_API_KEY)");
    warnings.push(
      "Neither DEEPGRAM_API_KEY nor AI_GATEWAY_API_KEY is configured. Inbound voice notes will trigger voice recovery asking the citizen to retry or send text.",
    );
  }

  const cartesiaKey = env.CARTESIA_API_KEY?.trim();
  const cartesiaVoiceId = env.CARTESIA_VOICE_ID?.trim();
  if (!cartesiaKey) {
    missingVariables.push("CARTESIA_API_KEY");
    warnings.push("CARTESIA_API_KEY is not configured. Bot voice replies will fall back to text.");
  }
  if (!cartesiaVoiceId) {
    missingVariables.push("CARTESIA_VOICE_ID");
    warnings.push("CARTESIA_VOICE_ID is not configured. Bot voice replies will fall back to text.");
  }

  return {
    sttConfigured,
    sttModel,
    ttsConfigured: Boolean(cartesiaKey && cartesiaVoiceId),
    ttsVoiceId: cartesiaVoiceId,
    missingVariables,
    warnings,
  };
};

export const logVoiceEnvironmentStatus = (env: NodeJS.ProcessEnv = process.env): VoiceEnvironmentStatus => {
  const status = checkVoiceEnvironment(env);
  if (status.sttConfigured) {
    const providerName = env.AI_GATEWAY_API_KEY?.trim() ? "AI Gateway" : "Deepgram";
    console.info(`[voice] STT configured: ${providerName} (${status.sttModel})`);
  } else {
    console.warn(`[voice] STT not configured (DEEPGRAM_API_KEY / AI_GATEWAY_API_KEY missing). Inbound voice notes will prompt citizen to retry or send text.`);
  }

  if (status.ttsConfigured) {
    console.info(`[voice] TTS configured: Cartesia Sonic 3.6 (voice: ${status.ttsVoiceId})`);
  } else {
    const missing = [!env.CARTESIA_API_KEY && "CARTESIA_API_KEY", !env.CARTESIA_VOICE_ID && "CARTESIA_VOICE_ID"]
      .filter(Boolean)
      .join(", ");
    console.warn(`[voice] TTS not configured (${missing} missing). Replies will be delivered as text.`);
  }

  return status;
};
