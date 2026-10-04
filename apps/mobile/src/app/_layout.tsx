// Import only the two weights we use so the other five .ttf files stay out of the bundle.
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, SplashScreen } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useNotificationRouting } from "@/lib/push";
import { SessionProvider, useSession } from "@/lib/session";
import { shareIntentOptions } from "@/lib/share-intake";
import { fonts, useTheme } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  return (
    // FR-21: must wrap everything so a share that cold-starts the app is caught.
    <ShareIntentProvider options={shareIntentOptions()}>
      <SessionProvider>
        <SafeAreaProvider>
          <RootStack fontsLoaded={fontsLoaded} />
        </SafeAreaProvider>
      </SessionProvider>
    </ShareIntentProvider>
  );
}

function RootStack({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { c, dark } = useTheme();
  const { status, me } = useSession();
  const { hasShareIntent } = useShareIntentContext();
  // Signed in with a name: the app. Otherwise the sign-in flow (which also asks for the name).
  const ready = status === "signedIn" && !me?.needsName;
  const loading = status === "loading" || !fontsLoaded;

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);

  // A share that arrived (or arrived before sign-in) opens the share sheet once signed in.
  useEffect(() => {
    if (ready && hasShareIntent) router.push("/share");
  }, [ready, hasShareIntent]);

  useNotificationRouting(ready);

  // Dev-only shortcut: open a route at launch (EXPO_PUBLIC_DEV_START_ROUTE=/trip/t-tokyo).
  useEffect(() => {
    const start = process.env.EXPO_PUBLIC_DEV_START_ROUTE;
    if (__DEV__ && ready && start) router.push(start as never);
  }, [ready]);

  if (loading) return null;

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.primary, background: c.background, card: c.background, text: c.foreground, border: c.border },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerTintColor: c.primary,
          headerTitleStyle: { fontFamily: fonts.displayBold, color: c.foreground },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.background },
          contentStyle: { backgroundColor: c.background },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Protected guard={ready}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="trip/[tripId]/index" options={{ title: "" }} />
          <Stack.Screen name="trip/[tripId]/invite" options={{ presentation: "modal", title: "Invite" }} />
          <Stack.Screen name="add" options={{ presentation: "modal", title: "Add an idea" }} />
          <Stack.Screen name="new-trip" options={{ presentation: "modal", title: "New trip" }} />
          <Stack.Screen
            name="share"
            options={{
              presentation: "formSheet",
              title: "Save",
              headerShown: false,
              sheetAllowedDetents: [0.55, 1],
              sheetGrabberVisible: true,
              contentStyle: { backgroundColor: c.background },
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!ready}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
