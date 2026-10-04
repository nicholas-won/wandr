/**
 * Sign in / sign up (D74): phone number → texted 6-digit code (auto-submits) → name if needed.
 * One primary action per step (P3). The token goes to SecureStore via the session.
 */
import { useShareIntentContext } from "expo-share-intent";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { APP_NAME } from "@wandr/core/config";
import { CodeInput } from "@/components/CodeInput";
import { Body, Button, ErrorText, Eyebrow, Heading, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatAsTyped, looksLikePhone, toE164Guess } from "@/lib/phone";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

type Step = "phone" | "code" | "name";

export default function SignIn() {
  const { c } = useTheme();
  const session = useSession();
  const { hasShareIntent } = useShareIntentContext();
  const [step, setStep] = useState<Step>(session.me?.needsName ? "name" : "phone");
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; display: string; testMode: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!looksLikePhone(phone)) return setError("Enter your mobile number, with area code.");
    setBusy(true);
    setError(null);
    try {
      const res = await api("requestCode", { body: { channel: "sms", destination: toE164Guess(phone) } });
      setChallenge({ id: res.challenge, display: res.display, testMode: res.testMode });
      setCode("");
      setStep("code");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify(full: string) {
    if (!challenge || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api("verifyCode", { body: { challenge: challenge.id, code: full } });
      await session.completeSignIn(res.token, res.me);
      if (res.me.needsName) setStep("name");
    } catch (e) {
      setError(errorMessage(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const n = name.trim();
    if (!n) return setError("What should friends call you?");
    setBusy(true);
    setError(null);
    try {
      const res = await api("setName", { body: { name: n.slice(0, 40) } });
      session.setMe(res.me);
      await session.refresh().catch(() => undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8, marginTop: 24 }}>
            <Eyebrow>{APP_NAME}</Eyebrow>
            {step === "phone" ? (
              <>
                <Heading>Plan trips with friends</Heading>
                <Body muted>
                  {hasShareIntent
                    ? "Sign in to save what you shared. We'll text you a code; no password."
                    : "Sign in with your phone number. We'll text you a code; no password."}
                </Body>
              </>
            ) : step === "code" ? (
              <>
                <Heading>Enter the code</Heading>
                <Body muted>We texted a 6-digit code to {challenge?.display}.</Body>
              </>
            ) : (
              <>
                <Heading>What's your name?</Heading>
                <Body muted>This is how friends see you on trips.</Body>
              </>
            )}
          </View>

          {step === "phone" ? (
            <TextField
              label="Mobile number"
              value={phone}
              onChangeText={(t) => setPhone(formatAsTyped(t))}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              autoFocus
              returnKeyType="send"
              onSubmitEditing={sendCode}
            />
          ) : step === "code" ? (
            <View style={{ gap: 12 }}>
              <CodeInput value={code} onChange={setCode} onComplete={verify} disabled={busy} />
              {challenge?.testMode ? (
                <View style={{ backgroundColor: c.secondary, borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: c.secondaryForeground, fontWeight: "600" }}>Test mode: use 000000</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <TextField
              label="Your name"
              value={name}
              onChangeText={setName}
              textContentType="givenName"
              autoComplete="name-given"
              autoCapitalize="words"
              placeholder="First name"
              maxLength={40}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
          )}

          <ErrorText>{error}</ErrorText>

          <View style={{ flex: 1 }} />

          {step === "phone" ? (
            <Button title="Text me a code" onPress={sendCode} loading={busy} />
          ) : step === "code" ? (
            <View style={{ gap: 4 }}>
              <Button title={busy ? "Checking…" : "Continue"} onPress={() => verify(code)} disabled={code.length !== 6} loading={busy} />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStep("phone");
                  setError(null);
                }}
                style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: c.primary, fontWeight: "600", fontSize: 16 }}>Use a different number</Text>
              </Pressable>
            </View>
          ) : (
            <Button title="Done" onPress={saveName} loading={busy} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
