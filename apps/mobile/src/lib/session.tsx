/**
 * Who is signed in (D74). The token is in SecureStore; `me` and the trip list come from GET /me.
 */
import type { Me, TripSummary } from "@wandr/api-contract";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiRequestError, setUnauthorizedHandler } from "./api";
import { registerForPushIfGranted } from "./push";
import { tokenStore } from "./token-store";

type Status = "loading" | "signedOut" | "signedIn";

interface SessionValue {
  status: Status;
  me: Me | null;
  trips: TripSummary[];
  savedCount: number;
  /** Re-read /me (trip list, name). */
  refresh: () => Promise<void>;
  completeSignIn: (token: string, me: Me) => Promise<void>;
  setMe: (me: Me) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  const clear = useCallback(async () => {
    await tokenStore.set(null);
    setMe(null);
    setTrips([]);
    setSavedCount(0);
    setStatus("signedOut");
  }, []);

  const refresh = useCallback(async () => {
    const res = await api("me");
    setMe(res.me);
    setTrips(res.trips);
    setSavedCount(res.savedCount);
    setStatus("signedIn");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    (async () => {
      const token = await tokenStore.load();
      if (!token) return setStatus("signedOut");
      try {
        await refresh();
        void registerForPushIfGranted();
      } catch (e) {
        // Offline at launch: keep the token and show the signed-in shell; screens retry.
        if (e instanceof ApiRequestError && e.status === 401) await clear();
        else setStatus("signedIn");
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear, refresh]);

  const completeSignIn = useCallback(
    async (token: string, who: Me) => {
      await tokenStore.set(token);
      setMe(who);
      await refresh().catch(() => setStatus("signedIn"));
      void registerForPushIfGranted();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api("signOut", { body: {} }).catch(() => undefined);
    await clear();
  }, [clear]);

  const value = useMemo(
    () => ({ status, me, trips, savedCount, refresh, completeSignIn, setMe, signOut }),
    [status, me, trips, savedCount, refresh, completeSignIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
