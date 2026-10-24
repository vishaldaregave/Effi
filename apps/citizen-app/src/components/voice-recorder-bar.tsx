import {
  type AudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { Mic, Square, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { useColor } from "@/hooks/useColor";
import { transcribeAudioFile } from "@/services/voice-service";

export type VoiceTranscriptionPayload = {
  transcript: string;
  originalTranscript: string;
  detectedLanguage?: string | null | undefined;
};

type VoiceRecorderBarProps = {
  gatewayHost: string;
  token?: string | null | undefined;
  onTranscribed: (payload: VoiceTranscriptionPayload) => void;
  onClose: () => void;
  onError: (error: string) => void;
};

export function VoiceRecorderBar({
  gatewayHost,
  token,
  onTranscribed,
  onClose,
  onError,
}: VoiceRecorderBarProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorder: AudioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isRecordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const surface = useColor("homeSurface");
  const border = useColor("homeBorder");
  const text = useColor("foreground");
  const muted = useColor("textMuted");
  const red = useColor("red");
  const blue = useColor("submittedAccent");
  const white = useColor("civicHeaderForeground");

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function begin() {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!active) return;
        if (!permission.granted) {
          onError("Microphone permission was denied. You can continue typing your complaint.");
          onClose();
          return;
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        if (!active) return;

        await recorder.prepareToRecordAsync();
        if (!active) return;

        recorder.record();
        isRecordingRef.current = true;

        timerRef.current = setInterval(() => {
          if (active) {
            setSeconds((prev) => prev + 1);
          }
        }, 1000);
      } catch (err) {
        if (!active) return;
        isRecordingRef.current = false;
        const message = err instanceof Error ? err.message : "Failed to start microphone recording.";
        onError(message);
        onClose();
      }
    }

    void begin();

    return () => {
      active = false;
      stopTimer();
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        try {
          void recorder.stop().catch(() => undefined);
        } catch {
          // Shared object may already be released by expo-audio
        }
      }
    };
  }, [onClose, onError, recorder, stopTimer]);

  const handleCancel = useCallback(async () => {
    stopTimer();
    try {
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        await recorder.stop();
      }
    } catch {
      // Ignore cleanup error
    } finally {
      onClose();
    }
  }, [onClose, recorder, stopTimer]);

  const handleStopAndTranscribe = useCallback(async () => {
    stopTimer();
    setIsProcessing(true);

    try {
      if (isRecordingRef.current) {
        isRecordingRef.current = false;
        await recorder.stop();
      }

      let fileUri: string | null = null;
      try {
        fileUri = recorder.uri;
      } catch {
        fileUri = null;
      }

      if (!fileUri || seconds < 1) {
        onError("The recording was too short. Please speak and try again, or type below.");
        onClose();
        return;
      }

      const result = await transcribeAudioFile({
        gatewayHost,
        fileUri,
        token,
      });

      if (!result.ok) {
        onError(result.error);
      } else if (result.status === "unintelligible" || !result.transcript) {
        onError("Could not understand audio. Please speak clearly or type your report.");
      } else {
        onTranscribed({
          transcript: result.transcript,
          originalTranscript: result.originalTranscript || result.transcript,
          detectedLanguage: result.detectedLanguage ?? null,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transcription failed.";
      onError(message);
    } finally {
      setIsProcessing(false);
      onClose();
    }
  }, [gatewayHost, onClose, onError, onTranscribed, recorder, seconds, stopTimer, token]);

  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.leftGroup}>
        {isProcessing ? (
          <Spinner color={blue} size="sm" variant="circle" />
        ) : (
          <View style={[styles.recordingDot, { backgroundColor: red }]} />
        )}
        <View>
          <Text style={[styles.statusText, { color: text }]}>
            {isProcessing ? "Transcribing your voice..." : "Listening..."}
          </Text>
          <Text style={[styles.timerText, { color: muted }]}>
            {isProcessing ? "Sending to AI speech-to-text" : formatTime(seconds)}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Cancel recording"
          accessibilityRole="button"
          disabled={isProcessing}
          hitSlop={8}
          onPress={() => void handleCancel()}
          style={({ pressed }) => [styles.cancelButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Trash2 color={muted} size={19} strokeWidth={2.2} />
        </Pressable>

        <Pressable
          accessibilityLabel={isProcessing ? "Transcribing" : "Stop and transcribe recording"}
          accessibilityRole="button"
          disabled={isProcessing}
          onPress={() => void handleStopAndTranscribe()}
          style={({ pressed }) => [
            styles.stopButton,
            { backgroundColor: red, opacity: pressed || isProcessing ? 0.7 : 1 },
          ]}
        >
          {isProcessing ? (
            <Spinner color={white} size="sm" variant="circle" />
          ) : (
            <Square color={white} fill={white} size={16} />
          )}
          <Text style={[styles.stopButtonText, { color: white }]}>
            {isProcessing ? "Processing..." : "Done"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function MicTriggerButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const blue = useColor("submittedAccent");

  return (
    <Pressable
      accessibilityLabel="Record voice description"
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.micButton,
        { opacity: pressed || disabled ? 0.45 : 1 },
      ]}
    >
      <Mic color={blue} size={22} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  timerText: {
    fontSize: 12,
    marginTop: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    minHeight: 36,
  },
  stopButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
