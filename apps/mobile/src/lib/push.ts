/**
 * Push (FR-87, D75). We ask for permission only after the person creates their first trip (never
 * at launch), then register the Expo push token with POST /api/v1/push. Tapping a notification
 * opens the trip or idea (see useNotificationRouting).
 */
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "./api";
import { API_MOCK, EAS_PROJECT_ID } from "./env";
import { hrefForNotification } from "./routing";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function register(): Promise<boolean> {
  if (!Device.isDevice && !API_MOCK) return false; // simulators can't get a real push token
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Trip updates",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let expoPushToken: string;
  try {
    if (!EAS_PROJECT_ID) {
      if (!API_MOCK) return false;
      expoPushToken = "ExponentPushToken[mock-simulator]";
    } else {
      expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data;
    }
  } catch {
    return false;
  }
  await api("registerPush", { body: { expoPushToken, platform: Platform.OS === "ios" ? "ios" : "android" } }).catch(
    () => undefined,
  );
  return true;
}

/** On launch / sign-in: re-register only if the person already said yes. Never prompts. */
export async function registerForPushIfGranted() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") await register();
  } catch {
    // Notifications unavailable (e.g. Expo Go); nothing to do.
  }
}

/** After the first trip is created: ask once. */
export async function askForPushAfterFirstTrip() {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return register();
    if (!current.canAskAgain) return false;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === "granted") return register();
  } catch {
    // ignore
  }
  return false;
}

/** Open the trip/idea a tapped notification points to (cold start and while running). */
export function useNotificationRouting(enabled: boolean) {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!enabled || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const href = hrefForNotification(response.notification.request.content.data);
    if (href) router.push(href as never);
    void Notifications.clearLastNotificationResponseAsync?.();
  }, [enabled, response]);
}
