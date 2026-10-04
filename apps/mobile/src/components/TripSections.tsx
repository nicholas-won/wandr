/**
 * The trip's other sections, one tap from the ideas feed (D75 parity with the web's trip nav).
 * Mirrors apps/web/src/components/trip/sections.ts: solo trips hide group-only sections (§6.10).
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import type { TripDetail } from "@wandr/api-contract";
import { type Href, router } from "expo-router";
import { Pressable, ScrollView, Text } from "react-native";
import { useTheme } from "@/lib/theme";

type Section = { segment: string; label: string; icon: keyof typeof Ionicons.glyphMap; groupOnly?: boolean };

export const TRIP_SECTIONS: Section[] = [
  { segment: "plan", label: "Plan", icon: "calendar-outline" },
  { segment: "stops", label: "Stops", icon: "git-commit-outline" },
  { segment: "map", label: "Map", icon: "map-outline" },
  { segment: "money", label: "Money", icon: "wallet-outline" },
  { segment: "polls", label: "Polls", icon: "stats-chart-outline", groupOnly: true },
  { segment: "people", label: "People", icon: "people-outline" },
  { segment: "activity", label: "What's new", icon: "notifications-outline" },
  { segment: "settings", label: "Settings", icon: "settings-outline" },
];

export function TripSections({ trip }: { trip: TripDetail }) {
  const { c } = useTheme();
  const sections = TRIP_SECTIONS.filter((s) => !(s.groupOnly && trip.size === "solo"));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }} style={{ marginHorizontal: -16 }}>
      <Text style={{ width: 8 }} />
      {sections.map((s) => (
        <Pressable
          key={s.segment}
          accessibilityRole="link"
          accessibilityLabel={s.label}
          onPress={() => router.push(`/trip/${trip.id}/${s.segment}` as Href)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: pressed ? c.muted : c.card,
          })}
        >
          <Ionicons name={s.icon} size={16} color={c.foreground} />
          <Text style={{ color: c.foreground, fontWeight: "600", fontSize: 15 }}>{s.label}</Text>
        </Pressable>
      ))}
      <Text style={{ width: 8 }} />
    </ScrollView>
  );
}
