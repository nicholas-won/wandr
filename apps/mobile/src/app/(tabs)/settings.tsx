/** Settings: who you are, open the website, sign out. */
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Alert, ScrollView, View } from "react-native";
import { APP_NAME } from "@wandr/core/config";
import { Body, Button, Card, Heading } from "@/components/ui";
import { API_MOCK, WEB_URL } from "@/lib/env";
import { useSession } from "@/lib/session";

export default function Settings() {
  const { me, signOut } = useSession();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card style={{ padding: 16, gap: 4 }}>
        <Heading level={2}>{me?.name || "You"}</Heading>
        {me?.phone ? <Body muted>{me.phone}</Body> : null}
      </Card>

      <Button
        variant="secondary"
        title={`Open ${APP_NAME} on the web`}
        accessibilityHint="Opens the website in an in-app browser"
        onPress={() => void WebBrowser.openBrowserAsync(WEB_URL)}
      />
      <Button
        variant="ghost"
        title="Sign out"
        onPress={() =>
          Alert.alert("Sign out?", "You can sign back in with a texted code.", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => void signOut() },
          ])
        }
      />

      <View style={{ alignItems: "center", marginTop: 24 }}>
        <Body small muted>
          {APP_NAME} {Constants.expoConfig?.version ?? ""}
          {API_MOCK ? " · mock data" : ""}
        </Body>
      </View>
    </ScrollView>
  );
}
