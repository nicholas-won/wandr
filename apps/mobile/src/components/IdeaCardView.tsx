/**
 * An idea card (FR-23, FR-40–44): picture, title, location line, summary, comment count, and the
 * three vote buttons as big thumb targets. One tap votes (2 taps from opening the trip, P4).
 */
import type { IdeaCard, TripSize, VoteValue } from "@wandr/api-contract";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { memo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { groupNames, voteButtons, voteSummary } from "@/lib/votes";
import { sourceName } from "@/lib/links";
import { radius, TOUCH, useTheme } from "@/lib/theme";
import { Body, Card, Chip, Heading } from "./ui";

interface Props {
  idea: IdeaCard;
  size: TripSize;
  highlighted?: boolean;
  onVote: (idea: IdeaCard, value: VoteValue) => void;
}

export const IdeaCardView = memo(function IdeaCardView({ idea, size, highlighted, onVote }: Props) {
  const { c } = useTheme();
  const summary = voteSummary(idea, size);
  const names = groupNames(idea, size);
  const voteColor: Record<VoteValue, string> = { must: c.voteMust, down: c.voteDown, pass: c.votePass };

  return (
    <Card style={highlighted ? { borderColor: c.primary, borderWidth: 2 } : undefined}>
      {idea.imageUrl ? (
        <Image
          source={idea.imageUrl}
          style={styles.image}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      ) : (
        <View style={[styles.image, { backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }]}>
          {idea.processing ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <Ionicons name="location-outline" size={40} color={c.accentForeground} />
          )}
        </View>
      )}
      {idea.imageCredit ? (
        <Text style={[styles.credit, { color: c.mutedForeground }]} numberOfLines={1}>
          {idea.imageCredit}
        </Text>
      ) : null}

      <View style={styles.body}>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {idea.processing ? <Chip label="Finding the place…" tone="secondary" /> : null}
          {idea.needsReview ? <Chip label="Is this right?" tone="accent" /> : null}
          {idea.splitOpinions ? <Chip label={idea.splitOpinions} tone="accent" /> : null}
        </View>
        <Heading level={2}>{idea.title}</Heading>
        {idea.locationLabel ? <Body muted small>{idea.locationLabel}</Body> : null}
        {idea.summary ? <Body>{idea.summary}</Body> : null}

        <View style={styles.metaRow}>
          {idea.commentCount > 0 ? (
            <View style={styles.meta} accessible accessibilityLabel={`${idea.commentCount} comments`}>
              <Ionicons name="chatbubble-outline" size={16} color={c.mutedForeground} />
              <Body small muted>
                {idea.commentCount}
              </Body>
            </View>
          ) : null}
          {idea.sourceUrl ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Watch on ${sourceName(idea.sourceUrl)}`}
              onPress={() => void WebBrowser.openBrowserAsync(idea.sourceUrl!)}
              hitSlop={12}
              style={[styles.meta, { minHeight: TOUCH }]}
            >
              <Ionicons name="play-circle-outline" size={18} color={c.primary} />
              <Text style={{ color: c.primary, fontWeight: "600", fontSize: 15 }}>{sourceName(idea.sourceUrl)}</Text>
            </Pressable>
          ) : null}
        </View>

        {!idea.processing && !idea.notAPlace ? (
          <View style={styles.votes} accessibilityRole="radiogroup" accessibilityLabel={`Your vote on ${idea.title}`}>
            {voteButtons(size, idea.myVote, idea.title).map((b) => {
              const color = voteColor[b.value];
              return (
                <Pressable
                  key={b.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: b.selected }}
                  accessibilityLabel={b.accessibilityLabel}
                  accessibilityHint={b.accessibilityHint}
                  onPress={() => onVote(idea, b.value)}
                  style={({ pressed }) => [
                    styles.voteButton,
                    {
                      borderColor: color,
                      backgroundColor: b.selected ? color : "transparent",
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{ color: b.selected ? c.voteForeground : color, fontWeight: "800", fontSize: 16, textAlign: "center" }}
                    maxFontSizeMultiplier={1.6}
                  >
                    {b.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {summary ? (
          <Body small muted accessibilityLiveRegion="polite">
            {summary}
          </Body>
        ) : null}
        {names ? <Body small muted>{names}</Body> : null}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  image: { width: "100%", aspectRatio: 16 / 9 },
  credit: { fontSize: 11, paddingHorizontal: 12, paddingTop: 4 },
  body: { padding: 16, gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  votes: { flexDirection: "row", gap: 8, marginTop: 4 },
  voteButton: {
    flex: 1,
    minHeight: 56,
    borderWidth: 2,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
});
