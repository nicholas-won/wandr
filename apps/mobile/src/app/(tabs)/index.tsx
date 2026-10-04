/** Trips (home tab): the person's trips, newest activity first, and one primary action: New trip. */
import Ionicons from "@expo/vector-icons/Ionicons";
import type { TripSize } from "@wandr/api-contract";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Body, Button, Card, EmptyState, Heading } from "@/components/ui";
import { useSession } from "@/lib/session";
import { radius, useTheme } from "@/lib/theme";

const SIZE_LABEL: Record<TripSize, string> = { solo: "Just you", duo: "Two of you", group: "Group trip" };
const SIZE_ICON: Record<TripSize, keyof typeof Ionicons.glyphMap> = { solo: "person-outline", duo: "people-outline", group: "people-circle-outline" };

export default function Trips() {
  const { c } = useTheme();
  const { trips, refresh } = useSession();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh().catch(() => undefined);
    }, [refresh]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh().catch(() => undefined);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          <EmptyState
            title="Start your first trip"
            body="Drop in a TikTok, get a vote. Dates, cities and friends can come later."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${SIZE_LABEL[item.size]}`}
            onPress={() => router.push(`/trip/${item.id}`)}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Card style={styles.row}>
              <View style={[styles.icon, { backgroundColor: c.accent }]}>
                <Ionicons name={SIZE_ICON[item.size]} size={24} color={c.accentForeground} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Heading level={3}>{item.name}</Heading>
                <Body small muted>
                  {SIZE_LABEL[item.size]}
                </Body>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.mutedForeground} />
            </Card>
          </Pressable>
        )}
      />
      <View style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border }]}>
        <Button title="New trip" onPress={() => router.push("/new-trip")} icon={<Ionicons name="add" size={22} color={c.primaryForeground} />} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, minHeight: 72 },
  icon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
