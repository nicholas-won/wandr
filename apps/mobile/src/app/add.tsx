/**
 * Add an idea to a trip (FR-20) or save one to the library (FR-L1): paste a link or type an idea.
 * On open we check the clipboard and offer "Add the TikTok you copied?" (one tap).
 *
 * iOS shows a "paste from…" prompt whenever an app reads the clipboard, so on iOS we only ask
 * whether it holds a URL (no prompt) and read it when the person taps the offer. Android reads it
 * directly so the offer can name the source.
 */
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Body, Button, Card, ErrorText, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { clipboardOfferLabel, firstUrl } from "@/lib/links";
import { lastTripStore } from "@/lib/token-store";
import { useTheme } from "@/lib/theme";

/** Clipboard text already added in this session, so we don't offer it twice. */
const used = new Set<string>();

export default function AddIdea() {
  const { c } = useTheme();
  const { tripId, target } = useLocalSearchParams<{ tripId?: string; target?: string }>();
  const toLibrary = target === "library" || !tripId;
  const [raw, setRaw] = useState("");
  const [offer, setOffer] = useState<{ label: string; text: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          if (Platform.OS === "ios") {
            if (await Clipboard.hasUrlAsync()) alive && setOffer({ label: clipboardOfferLabel(null), text: null });
          } else {
            const text = await Clipboard.getStringAsync();
            if (alive && firstUrl(text) && !used.has(text)) setOffer({ label: clipboardOfferLabel(text), text });
          }
        } catch {
          // no clipboard access; the text field still works
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  async function submit(value: string) {
    const v = value.trim().slice(0, 4000);
    if (!v) return setError("Paste a link or type an idea.");
    setBusy(true);
    setError(null);
    try {
      if (toLibrary) await api("saveToLibrary", { body: { raw: v } });
      else {
        await api("addIdea", { params: { tripId: tripId! }, body: { raw: v } });
        void lastTripStore.set(tripId!);
      }
      used.add(v);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function takeOffer() {
    const text = offer?.text ?? (await Clipboard.getStringAsync().catch(() => ""));
    setOffer(null);
    if (!text) return;
    if (used.has(text.trim())) {
      setRaw(text);
      return setError("You already added that one. Add it again?");
    }
    await submit(text);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: toLibrary ? "Save a link" : "Add an idea" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        {offer ? (
          <Card style={{ padding: 16, gap: 12, backgroundColor: c.accent }}>
            <Body style={{ color: c.accentForeground, fontWeight: "700", fontSize: 17 }}>{offer.label}</Body>
            {offer.text ? (
              <Body small style={{ color: c.accentForeground }} numberOfLines={2}>
                {offer.text}
              </Body>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="Add it" onPress={takeOffer} loading={busy} style={{ flex: 1 }} />
              <Button title="Not now" variant="ghost" onPress={() => setOffer(null)} />
            </View>
          </Card>
        ) : null}

        <TextField
          label={toLibrary ? "Save for someday" : "Link or idea"}
          hint="TikTok, Reel, YouTube, Google Maps, any page, or just type a place."
          value={raw}
          onChangeText={setRaw}
          placeholder="https://www.tiktok.com/…"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={{ minHeight: 96, textAlignVertical: "top" }}
          autoFocus={!offer}
        />
        <ErrorText>{error}</ErrorText>
        <Button title={toLibrary ? "Save" : "Add idea"} onPress={() => submit(raw)} loading={busy} disabled={!raw.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
