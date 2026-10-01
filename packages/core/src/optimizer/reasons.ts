import { formatMinute } from "./rules";
import type { ReasonCode } from "./types";

const MEAL_LABEL = { breakfast: "Breakfast", brunch: "Brunch", lunch: "Lunch", dinner: "Dinner" };
const TOD_LABEL = {
  morning: "Morning pick",
  afternoon: "Afternoon pick",
  evening: "Evening pick",
  night: "Late-night spot",
};

/** Default English for one reason fact (FR-O2). Claude may rewrite these later. */
export function reasonText(r: ReasonCode): string {
  switch (r.code) {
    case "locked":
      return "Locked in place";
    case "reservation":
      return `Reservation at ${formatMinute(r.minute)}`;
    case "time_unassigned":
      return "No free time slot left; pick a time";
    case "suggested":
      return "Suggested Must-do: there was room";
    case "parallel":
      return `Side plan for ${r.attendeeCount} ${r.attendeeCount === 1 ? "person" : "people"}`;
    case "arrival_day":
      return r.dinnerOnly ? "Late arrival, so just dinner" : "Arrival day, kept light";
    case "departure_day":
      return "Departure day, kept light";
    case "closes_at":
      return `Closes at ${formatMinute(r.minute)}`;
    case "meal_window":
      return `${MEAL_LABEL[r.meal]} window${r.nearLodging ? " near your stay" : ""}`;
    case "clustered":
      return `Grouped with ${r.nearbyCount} other ${r.nearbyCount === 1 ? "spot" : "spots"} nearby`;
    case "time_of_day":
      return TOD_LABEL[r.timeOfDay];
    case "near_lodging":
      return "Close to your stay";
    case "must_do":
      return "Must-do, scheduled first";
    case "no_location":
      return "Placed by time of day (no location)";
  }
}

const ORDER: ReasonCode["code"][] = [
  "locked",
  "reservation",
  "time_unassigned",
  "suggested",
  "parallel",
  "arrival_day",
  "closes_at",
  "meal_window",
  "clustered",
  "time_of_day",
  "no_location",
  "near_lodging",
  "must_do",
  "departure_day",
];

/** Sorts facts by importance and joins the top two into one short line. */
export function summarizeReasons(codes: ReasonCode[]): { codes: ReasonCode[]; text: string } {
  // "Late arrival, so just dinner" leads; a plain "Arrival day" note is background.
  const weight = (r: ReasonCode) =>
    r.code === "arrival_day" && !r.dinnerOnly ? ORDER.indexOf("departure_day") : ORDER.indexOf(r.code);
  const sorted = codes.slice().sort((a, b) => weight(a) - weight(b));
  const text = sorted
    .slice(0, 2)
    .map(reasonText)
    .join(" · ");
  return { codes: sorted, text: text || "Fits here" };
}
