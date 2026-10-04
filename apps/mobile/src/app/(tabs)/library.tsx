/** Library tab (§6.12): saves grouped by city ("Lisbon · 3"), private to you (FR-L25). */
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SaveCard } from "@wandr/api-contract";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { Body, Button, Card, Chip, EmptyState, ErrorText, Heading } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { groupSaves } from "@/lib/library";
import { radius, useTheme } from "@/lib/theme";

export default function Library() {
  const { c } = useTheme();
  const [saves, setSaves] = useState<SaveCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api("library");
      setSaves(res.saves);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Poll while something is still being sorted (FR-23 processing state).
  const processing = saves?.some((s) => s.processing) ?? false;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!processing) return;
    timer.current = setInterval(() => void load(), 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [processing, load]);

  const sections = useMemo(() => groupSaves(saves ?? []), [saves]);

  if (saves === null && !error) {
    return <ActivityIndicator style={{ marginTop: 48 }} color={c.primary} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(s) => s.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, flexGrow: 1 }}
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
        ListHeaderComponent={error ? <ErrorText>{error}</ErrorText> : null}
        ListEmptyComponent={
          <EmptyState
            title="Save it now, go someday"
            body="Share a TikTok or Reel to the app, or paste a link. We'll sort it by city."
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={{ paddingTop: 20, paddingBottom: 10 }} accessible accessibilityRole="header">
            <Heading level={2}>
              {section.title} · {section.data.length}
            </Heading>
            {section.subtitle ? <Body small muted>{section.subtitle}</Body> : null}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <Card style={styles.row}>
            {item.imageUrl ? (
              <Image source={item.imageUrl} style={styles.thumb} contentFit="cover" accessible={false} />
            ) : (
              <View style={[styles.thumb, { backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }]}>
                {item.processing ? <ActivityIndicator color={c.primary} /> : <Ionicons name="location-outline" size={24} color={c.accentForeground} />}
              </View>
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <Heading level={3}>{item.title}</Heading>
              {item.summary ? (
                <Body small muted numberOfLines={2}>
                  {item.summary}
                </Body>
              ) : null}
              <Chip label={item.processing ? "Sorting…" : item.category} />
            </View>
          </Card>
        )}
      />
      <View style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border }]}>
        <Button title="Save a link" onPress={() => router.push("/add?target=library")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, padding: 12, alignItems: "flex-start" },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
