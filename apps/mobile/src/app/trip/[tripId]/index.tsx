/**
 * Trip: the ideas feed (FR-23, FR-40–44, §6.10). One primary action: Add idea. Voting is one tap
 * on a card. Invite is one tap away in the header, never pushed (FR-T2).
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import type { IdeaCard, TripDetail, VoteValue } from "@wandr/api-contract";
import * as Haptics from "expo-haptics";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { IdeaCardView } from "@/components/IdeaCardView";
import { TripSections } from "@/components/TripSections";
import { Body, Button, EmptyState, ErrorText, Heading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { lastTripStore } from "@/lib/token-store";
import { useTheme } from "@/lib/theme";
import { duoNotice, nextVote, sizeLine, withMyVote } from "@/lib/votes";

export default function TripScreen() {
  const { c } = useTheme();
  const { tripId, idea: focusIdea } = useLocalSearchParams<{ tripId: string; idea?: string }>();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList<IdeaCard>>(null);
  const scrolledTo = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTrip(await api("trip", { params: { tripId } }));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void lastTripStore.set(tripId);
    }, [load, tripId]),
  );

  // While AI is still resolving a card, refresh every few seconds so it fills in (FR-23).
  const processing = trip?.ideas.some((i) => i.processing) ?? false;
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [processing, load]);

  // Opened from a notification for a specific idea: scroll to it once.
  useEffect(() => {
    if (!trip || !focusIdea || scrolledTo.current === focusIdea) return;
    const index = trip.ideas.findIndex((i) => i.id === focusIdea);
    if (index >= 0) {
      scrolledTo.current = focusIdea;
      setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 }), 300);
    }
  }, [trip, focusIdea]);

  const onVote = useCallback(
    async (idea: IdeaCard, tapped: VoteValue) => {
      if (!trip) return;
      const value = nextVote(idea.myVote, tapped);
      void Haptics.selectionAsync();
      const before = trip;
      setTrip({
        ...trip,
        ideas: trip.ideas.map((i) => (i.id === idea.id ? withMyVote(i, value, trip.size, trip.me.displayName) : i)),
      });
      try {
        await api("vote", { params: { tripId: trip.id, ideaId: idea.id }, body: { value } });
        await load(); // tallies and names come from the server (blind until you vote, FR-41)
      } catch (e) {
        setTrip(before);
        Alert.alert("Vote didn't save", errorMessage(e));
      }
    },
    [trip, load],
  );

  const notice = trip ? duoNotice(trip) : null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: "",
          headerRight: () =>
            trip ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Invite someone"
                onPress={() => router.push(`/trip/${trip.id}/invite`)}
                hitSlop={8}
                style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="person-add-outline" size={22} color={c.primary} />
              </Pressable>
            ) : null,
        }}
      />
      {!trip && !error ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={c.primary} />
      ) : (
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          ref={listRef}
          data={trip?.ideas ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120, flexGrow: 1 }}
          onScrollToIndexFailed={() => undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={c.primary}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListHeaderComponent={
            <View style={{ gap: 4 }}>
              <ErrorText>{error}</ErrorText>
              {trip ? (
                <>
                  <Heading>{trip.name}</Heading>
                  <Body muted>
                    {sizeLine(trip)}
                    {trip.stops.length > 1 ? ` · ${trip.stops.map((s) => s.name).join(", ")}` : ""}
                  </Body>
                  {notice ? (
                    <Body small muted>
                      {notice}
                    </Body>
                  ) : null}
                  <TripSections trip={trip} />
                </>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            trip ? (
              <EmptyState
                title="Drop a TikTok, get a vote"
                body="Paste a TikTok, Reel or Maps link, or share one to the app. We'll find the place."
              />
            ) : null
          }
          renderItem={({ item }) => (
            <IdeaCardView idea={item} size={trip!.size} highlighted={item.id === focusIdea} onVote={onVote} />
          )}
        />
      )}
      {trip ? (
        <View style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border }]}>
          <Button
            title="Add idea"
            onPress={() => router.push(`/add?tripId=${encodeURIComponent(trip.id)}`)}
            icon={<Ionicons name="add" size={22} color={c.primaryForeground} />}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, borderTopWidth: StyleSheet.hairlineWidth },
});
