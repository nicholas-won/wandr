/**
 * New trip (FR-1, mirrors web /start): destinations, dates and a name, all optional (P1 zero
 * setup). After the first trip is created we ask for push permission (never at launch).
 */
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { DateField } from "@/components/DateField";
import { Body, Button, ErrorText, Heading, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { parseDestinations, toISODate } from "@/lib/dates";
import { askForPushAfterFirstTrip } from "@/lib/push";
import { useSession } from "@/lib/session";
import { lastTripStore } from "@/lib/token-store";

export default function NewTrip() {
  const { trips, refresh } = useSession();
  const [destinations, setDestinations] = useState("");
  const [name, setName] = useState("");
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const firstTrip = trips.length === 0;
    try {
      const dests = parseDestinations(destinations);
      const { tripId } = await api("createTrip", {
        body: {
          ...(name.trim() ? { name: name.trim().slice(0, 80) } : {}),
          ...(dests.length ? { destinations: dests } : {}),
          ...(start ? { startDate: toISODate(start) } : {}),
          ...(end ? { endDate: toISODate(end) } : {}),
        },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void lastTripStore.set(tripId);
      void refresh().catch(() => undefined);
      router.dismiss();
      router.push(`/trip/${tripId}`);
      if (firstTrip) void askForPushAfterFirstTrip();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Heading>Where are you headed?</Heading>
          <Body muted>Everything is optional. You can add cities, dates and friends later.</Body>
        </View>
        <TextField
          label="Destinations"
          hint="Separate cities with commas"
          value={destinations}
          onChangeText={setDestinations}
          placeholder="Lisbon, Porto"
          autoCapitalize="words"
          autoFocus
        />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <DateField label="From" value={start} onChange={setStart} />
          <DateField label="To" value={end} onChange={setEnd} minimumDate={start ?? undefined} />
        </View>
        <TextField label="Trip name" value={name} onChangeText={setName} placeholder="Girls' trip 2027" maxLength={80} />
        <ErrorText>{error}</ErrorText>
        <Button title="Create trip" onPress={create} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
