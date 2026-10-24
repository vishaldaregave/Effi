import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Square, Volume2 } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { useColor } from "@/hooks/useColor";
import { getSynthesisAudioUrl } from "@/services/voice-service";

type SpeechPlaybackButtonProps = {
  text: string;
  gatewayHost: string;
  languageCode?: string | undefined;
  onError?: ((error: string) => void) | undefined;
};

export function SpeechPlaybackButton({
  text,
  gatewayHost,
  languageCode,
  onError,
}: SpeechPlaybackButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);

  const blue = useColor("submittedAccent");
  const blueTint = useColor("submittedTint");
  const muted = useColor("textMuted");

  const stopPlayback = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.remove();
      } catch {
        // Ignore cleanup error
      }
      playerRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const cleanText = text.trim();
    if (!cleanText) return;

    setIsLoading(true);

    try {
      stopPlayback();
      const audioUrl = getSynthesisAudioUrl(gatewayHost, cleanText, languageCode);
      const player = createAudioPlayer(audioUrl);
      playerRef.current = player;

      player.addListener("playbackStatusUpdate", (status) => {
        if (status.isLoaded) {
          setIsLoading(false);
          setIsPlaying(status.playing);
          if (status.currentTime >= status.duration && status.duration > 0) {
            setIsPlaying(false);
          }
        }
      });

      player.play();
      setIsPlaying(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audio playback failed.";
      onError?.(message);
      stopPlayback();
    } finally {
      setIsLoading(false);
    }
  }, [gatewayHost, isPlaying, languageCode, onError, stopPlayback, text]);

  return (
    <Pressable
      accessibilityLabel={isPlaying ? "Stop audio read-out" : "Listen to Effi's response"}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => void togglePlayback()}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isPlaying ? blueTint : "transparent",
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      {isLoading ? (
        <Spinner color={blue} size="sm" variant="circle" />
      ) : isPlaying ? (
        <Square color={blue} fill={blue} size={15} />
      ) : (
        <Volume2 color={muted} size={17} strokeWidth={2.2} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
});
