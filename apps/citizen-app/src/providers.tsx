import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { resolveDevHost } from "@/bot-gateway-config";
import { ModeProvider } from "@/providers/mode-provider";

const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = resolveDevHost(process.env.EXPO_PUBLIC_CONVEX_URL, 3210);
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function MissingConfiguration() {
  const missing = [
    !clerkKey && "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
    !convexUrl && "EXPO_PUBLIC_CONVEX_URL",
  ].filter((name): name is string => Boolean(name));

  return (
    <View style={styles.configScreen}>
      <Text variant="title">Effi needs configuration</Text>
      <Text variant="caption" style={styles.configCopy}>
        Copy apps/citizen-app/.env.example to .env.local and set: {missing.join(", ")}.
      </Text>
    </View>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  console.log("[AppProviders] rendering", { clerkKey: Boolean(clerkKey), convexUrl });
  if (!clerkKey || !convex) return <MissingConfiguration />;

  return (
    <ClerkProvider publishableKey={clerkKey} {...(tokenCache ? { tokenCache } : {})}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ModeProvider defaultMode="light">{children}</ModeProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  configScreen: {
    flex: 1,
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
  configCopy: {
    lineHeight: 22,
  },
});
