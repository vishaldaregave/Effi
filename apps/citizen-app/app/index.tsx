import { useAuth } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import { StyleSheet } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { View } from "@/components/ui/view";
import { WelcomeScreen } from "@/welcome-screen";

export default function HomeScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  console.log("[HomeScreen]", { isLoaded, isSignedIn });

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <Spinner label="Checking your session" />
      </View>
    );
  }

  if (isSignedIn) return <Redirect href="./main/home" />;

  return (
    <WelcomeScreen
      onGetStarted={() => router.push("./sign-up")}
      onSignIn={() => router.push("./sign-in")}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
