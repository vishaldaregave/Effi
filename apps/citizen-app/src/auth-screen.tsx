import { isClerkAPIResponseError, useAuth, useSignUp, useSSO } from "@clerk/expo";
import { useSignIn } from "@clerk/expo/legacy";
import * as AuthSession from "expo-auth-session";
import { Redirect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowLeft } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { EffiMark } from "@/components/effi-mark";
import { AvoidKeyboard } from "@/components/ui/avoid-keyboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP } from "@/components/ui/input-otp";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { oauthNativeCallbackPath, signedInHomeRoute } from "@/auth-routes";
import { useColor } from "@/hooks/useColor";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "sign-in" | "sign-up";

type AuthViewState =
  | { kind: "credentials" }
  | { kind: "verify-sign-up-email"; emailAddress: string }
  | { kind: "verify-sign-in-device"; emailAddress: string; emailAddressId: string };

type AuthScreenProps = {
  mode: AuthMode;
};

function GoogleLogo() {
  const blue = useColor("googleBlue");
  const green = useColor("googleGreen");
  const yellow = useColor("googleYellow");
  const red = useColor("googleRed");

  return (
    <Svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      {...(Platform.OS === "web" ? { "aria-hidden": true } : { accessible: false })}
    >
      <Path fill={blue} d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
      <Path fill={green} d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
      <Path fill={yellow} d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.53l3.35-2.61Z" />
      <Path fill={red} d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
    </Svg>
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (isClerkAPIResponseError(error)) {
    return error.errors[0]?.longMessage ?? error.errors[0]?.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

function useWarmOAuthBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export function AuthScreen({ mode }: AuthScreenProps) {
  useWarmOAuthBrowser();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isSignedIn } = useAuth();
  const { isLoaded: isSignInLoaded, signIn, setActive } = useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [view, setView] = useState<AuthViewState>({ kind: "credentials" });
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [passwordSignInLoading, setPasswordSignInLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const background = useColor("background");
  const foreground = useColor("foreground");
  const muted = useColor("mutedForeground");
  const border = useColor("border");
  const blue = useColor("blue");
  const brandForeground = useColor("brandForeground");
  const destructive = useColor("destructive");
  const submitting = oauthLoading
    || passwordSignInLoading
    || signUpStatus === "fetching";

  const navigateHome = () => router.replace(signedInHomeRoute);

  if (isSignedIn) return <Redirect href={signedInHomeRoute} />;

  const finishSignUp = async () => {
    if (signUp.status !== "complete") {
      setLocalError("Your account still needs another step before it can continue.");
      return;
    }
    const result = await signUp.finalize();
    if (result.error) {
      setLocalError(errorMessage(result.error, "We could not finish creating your account."));
      return;
    }
    navigateHome();
  };

  const continueWithGoogle = async () => {
    setLocalError(null);
    setOauthLoading(true);
    try {
      const redirectUrl = AuthSession.makeRedirectUri({ scheme: "effi", path: oauthNativeCallbackPath });
      const result = await startSSOFlow({ strategy: "oauth_google", redirectUrl });

      if (!result.createdSessionId || !result.setActive) {
        setLocalError("Google needs more account information. Finish the required fields in Clerk, then try again.");
        return;
      }

      await result.setActive({ session: result.createdSessionId });
      navigateHome();
    } catch (error: unknown) {
      setLocalError(errorMessage(error, "Google sign-in did not finish. Please try again."));
    } finally {
      setOauthLoading(false);
    }
  };

  const submitCredentials = async () => {
    const cleanEmail = emailAddress.trim();
    if (!cleanEmail || !password || submitting) return;
    Keyboard.dismiss();
    setLocalError(null);

    if (mode === "sign-in") {
      if (!isSignInLoaded) return;
      setPasswordSignInLoading(true);
      try {
        const signInAttempt = await signIn.create({ identifier: cleanEmail, password });
        if (signInAttempt.status === "complete" && signInAttempt.createdSessionId) {
          await setActive({ session: signInAttempt.createdSessionId });
          navigateHome();
          return;
        }

        if (signInAttempt.status === "needs_client_trust") {
          const emailCodeFactor = signInAttempt.supportedSecondFactors?.find(
            (factor) => factor.strategy === "email_code",
          );
          if (!emailCodeFactor) {
            setLocalError("Clerk requires device verification but did not provide an email verification method.");
            return;
          }
          await signIn.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: emailCodeFactor.emailAddressId,
          });
          setView({
            kind: "verify-sign-in-device",
            emailAddress: cleanEmail,
            emailAddressId: emailCodeFactor.emailAddressId,
          });
          setCode("");
          return;
        }

        setLocalError(`Sign-in stopped at ${signInAttempt.status ?? "an unknown state"}.`);
      } catch (error: unknown) {
        setLocalError(errorMessage(error, "Check your email and password, then try again."));
      } finally {
        setPasswordSignInLoading(false);
      }
      return;
    }

    const result = await signUp.password({ emailAddress: cleanEmail, password });
    if (result.error) {
      setLocalError(errorMessage(result.error, "We could not create your account."));
      return;
    }
    if (signUp.status === "complete") {
      await finishSignUp();
      return;
    }
    if (signUp.unverifiedFields.includes("email_address")) {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) {
        setLocalError(errorMessage(sent.error, "We could not send the verification code."));
        return;
      }
      setView({ kind: "verify-sign-up-email", emailAddress: cleanEmail });
      setCode("");
      return;
    }
    setLocalError("Clerk needs more account information before sign-up can finish.");
  };

  const verifyEmail = async () => {
    if (code.length !== 6 || submitting) return;
    Keyboard.dismiss();
    setLocalError(null);
    const result = await signUp.verifications.verifyEmailCode({ code });
    if (result.error) {
      setLocalError(errorMessage(result.error, "That code is invalid or expired."));
      return;
    }
    await finishSignUp();
  };

  const verifySignInDevice = async () => {
    if (code.length !== 6 || submitting || !isSignInLoaded) return;
    Keyboard.dismiss();
    setLocalError(null);
    setPasswordSignInLoading(true);
    try {
      const signInAttempt = await signIn.attemptSecondFactor({ strategy: "email_code", code });
      if (signInAttempt.status !== "complete" || !signInAttempt.createdSessionId) {
        setLocalError(`Device verification stopped at ${signInAttempt.status ?? "an unknown state"}.`);
        return;
      }
      await setActive({ session: signInAttempt.createdSessionId });
      navigateHome();
    } catch (error: unknown) {
      setLocalError(errorMessage(error, "That code is invalid or expired."));
    } finally {
      setPasswordSignInLoading(false);
    }
  };

  const resendCode = async () => {
    setLocalError(null);
    if (view.kind === "verify-sign-in-device") {
      if (!isSignInLoaded) return;
      setPasswordSignInLoading(true);
      try {
        await signIn.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: view.emailAddressId,
        });
      } catch (error: unknown) {
        setLocalError(errorMessage(error, "We could not send a new code."));
      } finally {
        setPasswordSignInLoading(false);
      }
      return;
    }
    const result = await signUp.verifications.sendEmailCode();
    if (result.error) setLocalError(errorMessage(result.error, "We could not send a new code."));
  };

  const fieldError = view.kind === "verify-sign-up-email"
    ? signUpErrors.fields.code
    : view.kind === "credentials" && mode === "sign-up"
      ? signUpErrors.fields.emailAddress ?? signUpErrors.fields.password
      : null;
  const visibleError = localError ?? fieldError?.longMessage ?? fieldError?.message ?? null;
  const otpSlotWidth = Math.min(46, Math.max(36, (width - 88) / 6));

  const title = view.kind !== "credentials"
    ? "Check your email"
    : mode === "sign-in"
      ? "Welcome back"
      : "Create your account";
  const description = view.kind !== "credentials"
    ? `Enter the 6-digit code sent to ${view.emailAddress}.`
    : mode === "sign-in"
      ? "Sign in to continue to Effi."
      : "Start reporting and tracking civic issues.";

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: background }]} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Button
          variant="ghost"
          size="icon"
          icon={ArrowLeft}
          label="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
        />
        <EffiMark size={38} />
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text variant="heading" style={[styles.title, { color: foreground }]}>{title}</Text>
          <Text variant="caption" style={[styles.description, { color: muted }]}>{description}</Text>
        </View>

        {view.kind === "credentials" ? (
          <>
            <Button
              variant="outline"
              size="lg"
              label="Continue with Google"
              disabled={submitting}
              loading={oauthLoading}
              onPress={() => void continueWithGoogle()}
              style={[styles.googleButton, { borderColor: border }]}
            >
              <GoogleLogo />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </Button>

            <View style={styles.dividerRow} accessibilityElementsHidden>
              <View style={[styles.divider, { backgroundColor: border }]} />
              <Text variant="caption" style={styles.dividerText}>or continue with email</Text>
              <View style={[styles.divider, { backgroundColor: border }]} />
            </View>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email address</Text>
                <Input
                  accessibilityLabel="Email address"
                  placeholder="you@example.com"
                  value={emailAddress}
                  onChangeText={setEmailAddress}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  variant="outline"
                  disabled={submitting}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Password</Text>
                <Input
                  accessibilityLabel="Password"
                  placeholder={mode === "sign-in" ? "Enter your password" : "At least 8 characters"}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  textContentType={mode === "sign-in" ? "password" : "newPassword"}
                  returnKeyType="go"
                  onSubmitEditing={() => void submitCredentials()}
                  variant="outline"
                  disabled={submitting}
                />
              </View>
              {visibleError ? (
                <Text accessibilityLiveRegion="polite" style={[styles.error, { color: destructive }]}>
                  {visibleError}
                </Text>
              ) : null}
              <Button
                size="lg"
                label={mode === "sign-in" ? "Sign in" : "Create account"}
                onPress={() => void submitCredentials()}
                disabled={!emailAddress.trim() || !password || submitting}
                loading={submitting && !oauthLoading}
                style={[styles.submitButton, { backgroundColor: blue }]}
                textStyle={{ color: brandForeground, fontWeight: "700" }}
              >
                {mode === "sign-in" ? "Sign in" : "Create account"}
              </Button>
            </View>

            <View style={styles.switchRow}>
              <Text variant="caption" style={styles.switchCopy}>
                {mode === "sign-in" ? "Don't have an account?" : "Already have an account?"}
              </Text>
              <Button
                variant="link"
                label={mode === "sign-in" ? "Sign up" : "Sign in"}
                onPress={() => router.replace(mode === "sign-in" ? "./sign-up" : "./sign-in")}
              >
                {mode === "sign-in" ? "Sign up" : "Sign in"}
              </Button>
            </View>
          </>
        ) : (
          <View style={styles.verificationForm}>
            <InputOTP
              length={6}
              value={code}
              onChangeText={setCode}
              disabled={submitting}
              haptic={false}
              {...(visibleError ? { error: visibleError } : {})}
              accessibilityLabel="Email verification code"
              containerStyle={styles.otpContainer}
              slotStyle={{ ...styles.otpSlot, width: otpSlotWidth }}
            />
            <Button
              size="lg"
              label={view.kind === "verify-sign-in-device" ? "Verify and sign in" : "Verify email"}
              onPress={() => void (view.kind === "verify-sign-in-device" ? verifySignInDevice() : verifyEmail())}
              disabled={code.length !== 6 || submitting}
              loading={submitting}
              style={[styles.submitButton, { backgroundColor: blue }]}
              textStyle={{ color: brandForeground, fontWeight: "700" }}
            >
              {view.kind === "verify-sign-in-device" ? "Verify and sign in" : "Verify email"}
            </Button>
            <Button variant="ghost" label="Send a new code" disabled={submitting} onPress={() => void resendCode()}>
              Send a new code
            </Button>
            <Button
              variant="link"
              label="Use a different email"
              disabled={submitting}
              onPress={() => {
                setView({ kind: "credentials" });
                setCode("");
                setLocalError(null);
              }}
            >
              Use a different email
            </Button>
          </View>
        )}

        <AvoidKeyboard offset={16} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { height: 62, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 44, height: 44 },
  topBarSpacer: { width: 44 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 34, paddingBottom: 16 },
  heading: { gap: 9, marginBottom: 30 },
  title: { fontSize: 34, lineHeight: 40, letterSpacing: -0.7 },
  description: { lineHeight: 23 },
  googleButton: { width: "100%", borderRadius: 14 },
  googleButtonText: { fontSize: 16, fontWeight: "600" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 26 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 13 },
  form: { gap: 16 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: "600" },
  error: { fontSize: 14, lineHeight: 20 },
  submitButton: { width: "100%", borderRadius: 14, marginTop: 2 },
  switchRow: { minHeight: 48, marginTop: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  switchCopy: { fontSize: 14 },
  verificationForm: { gap: 16 },
  otpContainer: { width: "100%" },
  otpSlot: { height: 52, borderRadius: 13 },
});
