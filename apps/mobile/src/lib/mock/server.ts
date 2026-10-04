/**
 * Mock /api/v1 server (EXPO_PUBLIC_API_MOCK=1). It is a `fetch` replacement handed to the real
 * `createApiClient`, so every mock response goes through the contract's zod schemas exactly like a
 * server response would. Pure TypeScript (no React Native) so it runs under vitest too.
 *
 * Sign in with any number and the code 000000. Privacy rules mirror the server's: blind group
 * tallies until you vote, Pass shown only as a count in groups (FR-41/42), duo votes open (§6.10).
 */
import { endpoints, type EndpointName, type IdeaCard, type TripSize, type VoteValue } from "@wandr/api-contract";
import { isSplitOpinions, SPLIT_OPINIONS_LABEL, voteLabel } from "@wandr/core/voting";
import { ME, fakePlaceFor, seedSaves, seedTrips, type MockIdea, type MockSave, type MockTrip } from "./fixtures";

export const MOCK_CODE = "000000";

export interface MockOptions {
  /** Simulated network latency (ms). */
  latencyMs?: number;
  /** How long "AI extraction" takes for new ideas (FR-23 processing state). */
  processingMs?: number;
  now?: () => number;
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function sizeOf(n: number): TripSize {
  return n <= 1 ? "solo" : n === 2 ? "duo" : "group";
}

export function createMockFetch(opts: MockOptions = {}): typeof fetch {
  const now = opts.now ?? (() => Date.now());
  const processingMs = opts.processingMs ?? 3500;
  const boot = now();
  const trips: MockTrip[] = seedTrips(boot);
  const saves: MockSave[] = seedSaves();
  const issuedTokens = new Set<string>();
  const challenges = new Map<string, string>();
  let myName = "";
  let seq = 1;
  const nextId = (p: string) => `${p}-${boot.toString(36)}-${seq++}`;

  // One idea still "processing" at launch so the FR-23 state is visible in the demo.
  trips[0]!.ideas.unshift({
    id: "i-processing",
    title: "Finding the place…",
    category: "Other",
    summary: null,
    stopId: null,
    locationLabel: null,
    imageUrl: null,
    sourceUrl: "https://www.tiktok.com/@lisbon/video/999",
    notAPlace: false,
    needsReview: false,
    commentCount: 0,
    readyAt: boot + processingMs,
    resolved: {
      title: "Tram 28 ride",
      category: "Activities",
      summary: "The yellow tram through Alfama. Board at Martim Moniz to get a seat.",
      stopId: "s-lis",
      locationLabel: "Alfama, Lisbon · Activities",
      imageUrl: "https://picsum.photos/seed/wandr-tram28/800/500",
    },
    votes: {},
  });

  const authed = (headers: Headers) => {
    const auth = headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token.startsWith("mock-")) throw new HttpError(401, "unauthorized", "Please sign in again.");
    // A token from an earlier app run (the in-memory state was reset): treat as a returning user.
    if (!issuedTokens.has(token) && !myName) myName = "Nick";
    return token;
  };

  const meObj = () => ({ id: "u-me", name: myName, phone: "•••• 0177", needsName: myName === "" });

  const myDisplayName = () => myName || "You";

  const tripOr404 = (id: string | undefined) => {
    const t = trips.find((x) => x.id === id);
    if (!t) throw new HttpError(404, "not_found", "That trip doesn't exist or you're not in it.");
    return t;
  };

  const settle = <T extends { readyAt: number; resolved?: object }>(x: T): T => {
    if (x.resolved && now() >= x.readyAt) {
      Object.assign(x, x.resolved);
      delete x.resolved;
    }
    return x;
  };

  function card(trip: MockTrip, i: MockIdea): IdeaCard {
    settle(i);
    const size = sizeOf(trip.members.length);
    const myVote = i.votes[ME] ?? null;
    const name = (id: string) => (id === ME ? myDisplayName() : trip.members.find((m) => m.id === id)?.displayName ?? "Someone");
    const all = Object.entries(i.votes);
    let tallyLabel: string | null = null;
    let namedVotes: IdeaCard["namedVotes"] = [];
    let splitOpinions: string | null = null;
    if (size === "duo") {
      namedVotes = all.map(([id, v]) => ({ name: name(id), label: voteLabel(v, size), isMe: id === ME }));
    } else if (size === "group" && myVote) {
      const must = all.filter(([, v]) => v === "must").length;
      const down = all.filter(([, v]) => v === "down").length;
      const pass = all.filter(([, v]) => v === "pass").length;
      tallyLabel = `${must + down} of ${all.length} are in${must ? ` · ${must} Must-do 🔥` : ""}`;
      namedVotes = all
        .filter(([, v]) => v !== "pass")
        .map(([id, v]) => ({ name: name(id), label: voteLabel(v, size), isMe: id === ME }));
      if (isSplitOpinions({ must, pass, voters: all.length }, size)) splitOpinions = SPLIT_OPINIONS_LABEL;
    }
    const processing = now() < i.readyAt;
    return {
      id: i.id,
      title: i.title,
      category: i.category,
      summary: i.summary,
      status: "idea",
      stopId: i.stopId,
      locationLabel: i.locationLabel,
      imageUrl: i.imageUrl,
      imageCredit: null,
      sourceUrl: i.sourceUrl,
      processing,
      needsReview: i.needsReview,
      notAPlace: i.notAPlace,
      myVote,
      tallyLabel,
      namedVotes,
      splitOpinions,
      rank: null,
      commentCount: i.commentCount,
      hiddenFromNames: [],
    };
  }

  function addIdeaTo(trip: MockTrip, raw: string): string {
    const place = fakePlaceFor(raw);
    const stop = trip.stops.find((s) => s.name === place.city) ?? trip.stops[0] ?? null;
    const id = nextId("i");
    trip.ideas.unshift({
      id,
      title: "Finding the place…",
      category: "Other",
      summary: null,
      stopId: null,
      locationLabel: null,
      imageUrl: null,
      sourceUrl: /^https?:\/\//.test(raw.trim()) ? raw.trim().split(/\s/)[0]! : null,
      notAPlace: false,
      needsReview: false,
      commentCount: 0,
      readyAt: now() + processingMs,
      resolved: {
        title: place.title,
        category: place.category,
        summary: place.summary,
        stopId: stop?.id ?? null,
        locationLabel: `${stop?.name ?? place.city} · ${place.category}`,
        imageUrl: `https://picsum.photos/seed/wandr-${encodeURIComponent(place.title)}/800/500`,
      },
      votes: {},
    });
    trip.touchedAt = now();
    return id;
  }

  function saveToLibrary(raw: string): string {
    const place = fakePlaceFor(raw);
    const id = nextId("sv");
    saves.unshift({
      id,
      title: "Sorting it…",
      category: "Other",
      summary: null,
      country: null,
      regionOrCity: null,
      imageUrl: null,
      sourceUrl: /^https?:\/\//.test(raw.trim()) ? raw.trim().split(/\s/)[0]! : null,
      readyAt: now() + processingMs,
      resolved: {
        title: place.title,
        category: place.category,
        summary: place.summary,
        country: place.country,
        regionOrCity: place.city,
        imageUrl: `https://picsum.photos/seed/wandr-${encodeURIComponent(place.title)}/800/500`,
      },
    });
    return id;
  }

  type Handler = (ctx: { params: Record<string, string>; body: any; headers: Headers }) => unknown;

  const handlers: Record<EndpointName, Handler> = {
    requestCode: ({ body }) => {
      const challenge = `ch-${seq++}`;
      challenges.set(challenge, body.destination);
      const digits = String(body.destination).replace(/\D/g, "");
      return { challenge, display: `•••• ${digits.slice(-4)}`, testMode: true };
    },
    verifyCode: ({ body }) => {
      if (!challenges.has(body.challenge)) throw new HttpError(400, "expired", "That code expired. Send a new one.");
      if (body.code !== MOCK_CODE) throw new HttpError(400, "wrong_code", "That code didn't work. Try again.");
      challenges.delete(body.challenge);
      const token = `mock-${Math.random().toString(36).slice(2)}`;
      issuedTokens.add(token);
      return { token, me: meObj() };
    },
    setName: ({ body, headers }) => {
      authed(headers);
      myName = String(body.name).trim();
      for (const t of trips) {
        const m = t.members.find((x) => x.id === ME);
        if (m) m.displayName = myName;
      }
      return { me: meObj() };
    },
    me: ({ headers }) => {
      authed(headers);
      const sorted = [...trips].sort((a, b) => b.touchedAt - a.touchedAt);
      return {
        me: meObj(),
        trips: sorted.map((t) => ({ id: t.id, name: t.name, size: sizeOf(t.members.length) })),
        savedCount: saves.length,
      };
    },
    createTrip: ({ body, headers }) => {
      authed(headers);
      const dests: string[] = (body.destinations ?? []).map((d: string) => d.trim()).filter(Boolean);
      const name = body.name?.trim() || (dests.length ? dests.join(" & ") : "New trip");
      const id = nextId("t");
      trips.push({
        id,
        name,
        touchedAt: now(),
        members: [{ id: ME, displayName: myDisplayName(), role: "owner" }],
        stops: dests.map((d) => ({ id: nextId("s"), name: d })),
        ideas: [],
      });
      return { tripId: id };
    },
    trip: ({ params, headers }) => {
      authed(headers);
      const t = tripOr404(params.tripId);
      const me = t.members.find((m) => m.id === ME)!;
      return {
        id: t.id,
        name: t.name,
        size: sizeOf(t.members.length),
        me: { memberId: ME, role: me.role, displayName: me.displayName },
        members: t.members.map((m) => ({ id: m.id, displayName: m.displayName, role: m.role })),
        stops: t.stops,
        ideas: t.ideas.map((i) => card(t, i)),
        webUrl: `https://wandr.example/t/${t.id}`,
      };
    },
    addIdea: ({ params, body, headers }) => {
      authed(headers);
      return { ideaId: addIdeaTo(tripOr404(params.tripId), body.raw) };
    },
    vote: ({ params, body, headers }) => {
      authed(headers);
      const t = tripOr404(params.tripId);
      const i = t.ideas.find((x) => x.id === params.ideaId);
      if (!i) throw new HttpError(404, "not_found", "That idea is gone.");
      const v = body.value as VoteValue | null;
      if (v) i.votes[ME] = v;
      else delete i.votes[ME];
      t.touchedAt = now();
      return { ok: true };
    },
    invite: ({ params, headers }) => {
      authed(headers);
      const t = tripOr404(params.tripId);
      return { link: `https://wandr.example/j/${t.id}-${seq++}`, texted: true };
    },
    library: ({ headers }) => {
      authed(headers);
      return {
        saves: saves.map((s) => {
          settle(s);
          return {
            id: s.id,
            title: s.title,
            category: s.category,
            summary: s.summary,
            country: s.country,
            regionOrCity: s.regionOrCity,
            imageUrl: s.imageUrl,
            imageCredit: null,
            processing: now() < s.readyAt,
            sourceUrl: s.sourceUrl,
          };
        }),
      };
    },
    saveToLibrary: ({ body, headers }) => {
      authed(headers);
      return { savedIdeaId: saveToLibrary(body.raw) };
    },
    shareIntake: ({ body, headers }) => {
      authed(headers);
      if (body.target.type === "trip") {
        const t = tripOr404(body.target.tripId);
        return { ideaId: addIdeaTo(t, body.raw), savedIdeaId: null, destination: t.name };
      }
      return { ideaId: null, savedIdeaId: saveToLibrary(body.raw), destination: "Your library" };
    },
    registerPush: ({ headers }) => {
      authed(headers);
      return { ok: true };
    },
    signOut: () => ({ ok: true }),
  };

  // Match "/api/v1/trips/:tripId/ideas" style templates.
  const routes = (Object.keys(endpoints) as EndpointName[]).map((name) => {
    const ep = endpoints[name];
    const keys: string[] = [];
    const re = new RegExp(
      `^${ep.path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
        keys.push(k);
        return "([^/]+)";
      })}$`,
    );
    return { name, method: ep.method, re, keys };
  });

  const json = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  return async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, idx) => (params[k] = decodeURIComponent(m[idx + 1]!)));
      const ep = endpoints[r.name];
      let body: unknown = undefined;
      if (ep.body) {
        const parsed = ep.body.safeParse(init?.body ? JSON.parse(String(init.body)) : {});
        if (!parsed.success) return json(400, { error: "bad_request", message: "Check what you entered." });
        body = parsed.data;
      }
      try {
        return json(200, handlers[r.name]({ params, body, headers }));
      } catch (e) {
        if (e instanceof HttpError) return json(e.status, { error: e.code, message: e.message });
        return json(500, { error: "server_error", message: "Something went wrong." });
      }
    }
    return json(404, { error: "not_found", message: `No mock for ${method} ${url.pathname}` });
  };
}
