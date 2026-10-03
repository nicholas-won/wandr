/**
 * Invite (FR-4/5, D65): name + phone → the server makes a personal link (and texts it when it
 * can, without the trip's name). Then "Send to Sam" opens the native share sheet so the person
 * can send it themselves too (§6.10 duo pattern: the user's own phone sends it, free).
 */
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Share, View } from "react-native";
import { Body, Button, Card, ErrorText, Heading, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatAsTyped, looksLikePhone, toE164Guess } from "@/lib/phone";
import { useTheme } from "@/lib/theme";

export default function Invite() {
  const { c } = useTheme();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; texted: boolean; name: string } | null>(null);

  async function create() {
    const n = name.trim();
    if (!n) return setError("Who are you inviting?");
    if (!looksLikePhone(phone)) return setError("Enter their mobile number, with area code.");
    setBusy(true);
    setError(null);
    try {
      const res = await api("invite", { params: { tripId }, body: { name: n.slice(0, 40), phone: toE164Guess(phone) } });
      setResult({ ...res, name: n });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!result) return;
    // No trip name in the message (mirrors FR-86 for our own texts); the link shows it after opening.
    await Share.share({ message: `${result.name}, I added you to a trip. Vote on ideas here: ${result.link}` }).catch(() => undefined);
  }

  if (result) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Card style={{ padding: 16, gap: 8 }}>
          <Heading level={2}>{result.name}'s link is ready</Heading>
          <Body muted>
            {result.texted
              ? `We texted ${result.name} their personal link. They can vote right away, no app needed.`
              : `Send ${result.name} their personal link. They can vote right away, no app needed.`}
          </Body>
          <Body small muted selectable>
            {result.link}
          </Body>
        </Card>
        <Button title={`Send to ${result.name}`} onPress={send} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            variant="ghost"
            title="Invite someone else"
            style={{ flex: 1 }}
            onPress={() => {
              setResult(null);
              setName("");
              setPhone("");
            }}
          />
          <Button variant="ghost" title="Done" style={{ flex: 1 }} onPress={() => router.back()} />
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Body muted>Each person gets their own link to view and vote. Their number is never shown to the group.</Body>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Sam" autoCapitalize="words" autoFocus maxLength={40} />
        <TextField
          label="Mobile number"
          value={phone}
          onChangeText={(t) => setPhone(formatAsTyped(t))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          placeholder="(555) 123-4567"
          returnKeyType="send"
          onSubmitEditing={create}
        />
        <ErrorText>{error}</ErrorText>
        <Button title={name.trim() ? `Invite ${name.trim()}` : "Invite"} onPress={create} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
