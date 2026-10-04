/**
 * In-memory fixtures for mock mode (EXPO_PUBLIC_API_MOCK=1). One trip of each size (§6.10) so every
 * vote display can be checked without a server. Pictures come from picsum.photos (seeded, stable).
 */
import type { VoteValue } from "@wandr/api-contract";

export interface MockMember {
  id: string;
  displayName: string;
  role: "owner" | "organizer" | "member";
}

export interface MockIdea {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  stopId: string | null;
  locationLabel: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  notAPlace: boolean;
  needsReview: boolean;
  commentCount: number;
  /** Epoch ms when "extraction" finishes; before that the card shows as processing (FR-23). */
  readyAt: number;
  /** What the card becomes once ready (for ideas added in this session). */
  resolved?: Partial<Omit<MockIdea, "id" | "readyAt" | "resolved">>;
  votes: Record<string, VoteValue>;
}

export interface MockTrip {
  id: string;
  name: string;
  members: MockMember[];
  stops: { id: string; name: string }[];
  ideas: MockIdea[];
  touchedAt: number;
}

export interface MockSave {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  country: string | null;
  regionOrCity: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  readyAt: number;
  resolved?: Partial<Omit<MockSave, "id" | "readyAt" | "resolved">>;
}

export const ME = "m-me";
const pic = (seed: string) => `https://picsum.photos/seed/wandr-${seed}/800/500`;

function idea(p: Partial<MockIdea> & Pick<MockIdea, "id" | "title" | "category">): MockIdea {
  return {
    summary: null,
    stopId: null,
    locationLabel: null,
    imageUrl: pic(p.id),
    sourceUrl: null,
    notAPlace: false,
    needsReview: false,
    commentCount: 0,
    readyAt: 0,
    votes: {},
    ...p,
  };
}

export function seedTrips(now: number): MockTrip[] {
  return [
    {
      id: "t-lisbon",
      name: "Lisbon & Porto",
      touchedAt: now - 60_000,
      members: [
        { id: ME, displayName: "Nick", role: "owner" },
        { id: "m-sam", displayName: "Sam", role: "organizer" },
        { id: "m-ana", displayName: "Ana", role: "member" },
        { id: "m-leo", displayName: "Leo", role: "member" },
      ],
      stops: [
        { id: "s-lis", name: "Lisbon" },
        { id: "s-opo", name: "Porto" },
      ],
      ideas: [
        idea({
          id: "i-timeout",
          title: "Time Out Market",
          category: "Food",
          summary: "Food hall with 20+ stalls from Lisbon's best chefs. Go hungry, go early.",
          stopId: "s-lis",
          locationLabel: "Cais do Sodré, Lisbon · Food",
          sourceUrl: "https://www.tiktok.com/@lisbonfood/video/7301",
          commentCount: 3,
          votes: { "m-sam": "must", "m-ana": "down", "m-leo": "pass" },
        }),
        idea({
          id: "i-belem",
          title: "Pastéis de Belém",
          category: "Food",
          summary: "The original custard tarts since 1837. The line moves fast.",
          stopId: "s-lis",
          locationLabel: "Belém, Lisbon · Food",
          sourceUrl: "https://www.instagram.com/reel/C0belem",
          commentCount: 1,
          votes: { [ME]: "must", "m-sam": "must", "m-ana": "must", "m-leo": "down" },
        }),
        idea({
          id: "i-miradouro",
          title: "Sunset at Miradouro da Senhora do Monte",
          category: "Sights",
          summary: "Highest viewpoint in the city. Bring a bottle of vinho verde.",
          stopId: "s-lis",
          locationLabel: "Graça, Lisbon · Sights",
          votes: { [ME]: "down", "m-sam": "pass", "m-ana": "must", "m-leo": "pass" },
        }),
        idea({
          id: "i-lello",
          title: "Livraria Lello",
          category: "Sights",
          summary: "The ornate bookshop with the red staircase. Book a timed ticket.",
          stopId: "s-opo",
          locationLabel: "Porto · Sights",
          sourceUrl: "https://www.tiktok.com/@porto/video/8812",
          votes: { "m-ana": "down" },
        }),
      ],
    },
    {
      id: "t-tokyo",
      name: "Tokyo with Sam",
      touchedAt: now - 3_600_000,
      members: [
        { id: ME, displayName: "Nick", role: "owner" },
        { id: "m-sam", displayName: "Sam", role: "member" },
      ],
      stops: [{ id: "s-tyo", name: "Tokyo" }],
      ideas: [
        idea({
          id: "i-sushidai",
          title: "Sushi Dai",
          category: "Food",
          summary: "Omakase at the old Tsukiji outer market. Expect a queue at 6am.",
          stopId: "s-tyo",
          locationLabel: "Toyosu, Tokyo · Food",
          sourceUrl: "https://www.tiktok.com/@tokyoeats/video/1234",
          commentCount: 2,
          votes: { [ME]: "must", "m-sam": "down" },
        }),
        idea({
          id: "i-teamlab",
          title: "teamLab Planets",
          category: "Activities",
          summary: "Walk-through digital art; you wade through water barefoot.",
          stopId: "s-tyo",
          locationLabel: "Toyosu, Tokyo · Activities",
          votes: { "m-sam": "must" },
        }),
        idea({
          id: "i-goldengai",
          title: "Golden Gai bar crawl",
          category: "Nightlife",
          summary: "Six alleys of tiny bars, most seat eight people.",
          stopId: "s-tyo",
          locationLabel: "Shinjuku, Tokyo · Nightlife",
          votes: { [ME]: "pass", "m-sam": "must" },
        }),
      ],
    },
    {
      id: "t-cdmx",
      name: "Someday: Mexico City",
      touchedAt: now - 86_400_000,
      members: [{ id: ME, displayName: "Nick", role: "owner" }],
      stops: [{ id: "s-cdmx", name: "Mexico City" }],
      ideas: [
        idea({
          id: "i-contramar",
          title: "Contramar",
          category: "Food",
          summary: "Tuna tostadas and the two-colour grilled fish. Lunch only.",
          stopId: "s-cdmx",
          locationLabel: "Roma Norte, Mexico City · Food",
          votes: { [ME]: "must" },
        }),
        idea({
          id: "i-frida",
          title: "Museo Frida Kahlo",
          category: "Sights",
          summary: "The Blue House. Tickets sell out days ahead.",
          stopId: "s-cdmx",
          locationLabel: "Coyoacán, Mexico City · Sights",
        }),
      ],
    },
  ];
}

export function seedSaves(): MockSave[] {
  const s = (p: Partial<MockSave> & Pick<MockSave, "id" | "title" | "category">): MockSave => ({
    summary: null,
    country: null,
    regionOrCity: null,
    imageUrl: pic(p.id),
    sourceUrl: null,
    readyAt: 0,
    ...p,
  });
  return [
    s({ id: "sv-1", title: "Cervejaria Ramiro", category: "Food", country: "Portugal", regionOrCity: "Lisbon", summary: "Garlic prawns, then a steak sandwich for dessert." }),
    s({ id: "sv-2", title: "LX Factory", category: "Activities", country: "Portugal", regionOrCity: "Lisbon" }),
    s({ id: "sv-3", title: "Park Bar", category: "Drinks", country: "Portugal", regionOrCity: "Lisbon", summary: "Rooftop bar on top of a car park." }),
    s({ id: "sv-4", title: "Fushimi Inari at dawn", category: "Sights", country: "Japan", regionOrCity: "Kyoto" }),
    s({ id: "sv-5", title: "Nishiki Market", category: "Food", country: "Japan", regionOrCity: "Kyoto" }),
    s({ id: "sv-6", title: "Pujol", category: "Food", country: "Mexico", regionOrCity: "Mexico City" }),
    s({ id: "sv-7", title: "Hot-air balloon over Teotihuacán", category: "Activities", country: "Mexico", regionOrCity: "Mexico City" }),
  ];
}

/** Fake extraction result for a pasted link: stable per URL so repeated adds look the same. */
const FAKE_PLACES = [
  { title: "Cervejaria Ramiro", category: "Food", city: "Lisbon", country: "Portugal", summary: "Seafood institution; order the garlic prawns." },
  { title: "Ichiran Shibuya", category: "Food", city: "Tokyo", country: "Japan", summary: "Solo ramen booths, open all night." },
  { title: "Rooftop at Park Bar", category: "Drinks", city: "Lisbon", country: "Portugal", summary: "Sunset drinks on top of a car park." },
  { title: "Mercado Roma", category: "Food", city: "Mexico City", country: "Mexico", summary: "Gourmet food hall with a beer garden upstairs." },
  { title: "Shibuya Sky", category: "Sights", city: "Tokyo", country: "Japan", summary: "Open-air observation deck; book sunset slots early." },
];

export function fakePlaceFor(raw: string) {
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return FAKE_PLACES[Math.abs(h) % FAKE_PLACES.length]!;
}
