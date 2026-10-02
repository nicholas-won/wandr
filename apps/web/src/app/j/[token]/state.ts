export type JoinStep = "details" | "code" | "joining" | "confirm" | "result";

export type JoinResult = "pending" | "already_pending" | "ask_organizer" | "link_off" | "limited" | "recheck";

export type JoinState = {
  step: JoinStep;
  channel: "sms" | "email";
  /** Name as typed (kept across steps; re-validated on the server). */
  name: string;
  /** FR-17: "I'm 13 or older". */
  ageConfirmed: boolean;
  display?: string;
  lastInput?: string;
  error?: string;
  captchaRequired?: boolean;
  /** J-8 name check. */
  expectedName?: string;
  memberId?: string;
  result?: JoinResult;
};
