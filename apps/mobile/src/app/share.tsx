/**
 * Share sheet (FR-21): a TikTok / Reel / Maps link or text shared into the app lands here.
 * "Add to: [most recent trip ▾]" or "Your library", one tap to save, then a confirmation.
 * Signed-out shares go through sign-in first (the root layout reopens this after).
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Body, Button, Card, ErrorText, Heading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { rawFromShare, sourceName } from "@/lib/links";
import { defaultShareTarget } from "@/lib/routing";
import { useSession } from "@/lib/session";
import { lastTripStore } from "@/lib/token-store";
import { radius, TOUCH, useTheme } from "@/lib/theme";

type Target = { type: "trip"; tripId: string } | { type: "library" };

export default function ShareSheet() {
  const { c } = useTheme();
  const { trips } = useSession();
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const raw = useMemo(() => rawFromShare({ text: shareIntent.text, webUrl: shareIntent.webUrl }), [shareIntent]);
  const [target, setTarget] = useState<Target | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ destination: string; tripId: string | null } | null>(null);

  useEffect(() => {
    void lastTripStore.get().then((last) => setTarget((t) => t ?? defaultShareTarget(trips, last)));
  }, [trips]);

  const targetName = (t: Target | null) =>
    !t ? "…" : t.type === "library" ? "Your library" : trips.find((x) => x.id === t.tripId)?.name ?? "Trip";

  function close() {
    resetShareIntent();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  async function save() {
    if (!raw || !target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api("shareIntake", { body: { raw, target } });
      if (target.type === "trip") void lastTripStore.set(target.tripId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone({ destination: res.destination, tripId: target.type === "trip" ? target.tripId : null });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={styles.wrap}>
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 16 }}>
          <Ionicons name="checkmark-circle" size={56} color={c.voteDown} />
          <Heading level={2} style={{ textAlign: "center" }} accessibilityLiveRegion="polite">
            Added to {done.destination}
          </Heading>
          <Body muted style={{ textAlign: "center" }}>
            We'll find the place and file it.
          </Body>
        </View>
        {done.tripId ? (
          <Button
            title="Open trip"
            onPress={() => {
              resetShareIntent();
              router.replace(`/trip/${done.tripId}`);
            }}
          />
        ) : null}
        <Button title="Done" variant={done.tripId ? "ghost" : "primary"} onPress={close} />
      </View>
    );
  }

  if (!raw) {
    return (
      <View style={styles.wrap}>
        <Heading level={2}>Nothing to save</Heading>
        <Body muted>Share a link or some text (a TikTok, Reel or Maps link works best).</Body>
        <Button title="Done" onPress={close} />
      </View>
    );
  }

  const options: Target[] = [...trips.map((t) => ({ type: "trip" as const, tripId: t.id })), { type: "library" }];
  const same = (a: Target, b: Target | null) =>
    !!b && a.type === b.type && (a.type === "library" || (b.type === "trip" && a.tripId === b.tripId));

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Heading level={2}>Save this</Heading>
      <Card style={{ padding: 12, gap: 4 }}>
        <Text style={{ color: c.primary, fontWeight: "700" }}>{sourceName(raw)}</Text>
        <Body small muted numberOfLines={2}>
          {raw}
        </Body>
      </Card>

      <View style={{ gap: 6 }}>
        <Body small muted>
          Add to
        </Body>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add to ${targetName(target)}. Change`}
          accessibilityState={{ expanded: picking }}
          onPress={() => setPicking((p) => !p)}
          style={[styles.picker, { borderColor: c.input, backgroundColor: c.card }]}
        >
          <Ionicons name={target?.type === "library" ? "bookmark-outline" : "airplane-outline"} size={20} color={c.primary} />
          <Text style={{ flex: 1, color: c.foreground, fontSize: 17, fontWeight: "600" }}>{targetName(target)}</Text>
          <Ionicons name={picking ? "chevron-up" : "chevron-down"} size={20} color={c.mutedForeground} />
        </Pressable>
        {picking ? (
          <Card>
            {options.map((o) => (
              <Pressable
                key={o.type === "trip" ? o.tripId : "library"}
                accessibilityRole="radio"
                accessibilityState={{ checked: same(o, target) }}
                onPress={() => {
                  setTarget(o);
                  setPicking(false);
                }}
                style={[styles.option, { borderBottomColor: c.border }]}
              >
                <Text style={{ flex: 1, color: c.foreground, fontSize: 16 }}>
                  {o.type === "library" ? "Your library · save for someday" : targetName(o)}
                </Text>
                {same(o, target) ? <Ionicons name="checkmark" size={20} color={c.primary} /> : null}
              </Pressable>
            ))}
          </Card>
        ) : null}
      </View>

      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={save} loading={busy} disabled={!target} />
      <Button title="Cancel" variant="ghost" onPress={close} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 14 },
  picker: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: 14 },
  option: { flexDirection: "row", alignItems: "center", minHeight: TOUCH + 4, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
