/** Temporary screen for an area still being built for app parity (D75). Replace, don't extend. */
import { View } from "react-native";
import { Body, Heading } from "@/components/ui";

export function Placeholder({ title }: { title: string }) {
  return (
    <View style={{ flex: 1, padding: 24, gap: 8 }}>
      <Heading level={2}>{title}</Heading>
      <Body muted>Coming to the app soon. You can do this on the website for now.</Body>
    </View>
  );
}
