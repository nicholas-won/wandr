export type SignInState = {
  step: "contact" | "code" | "name";
  channel: "sms" | "email";
  /** Where to go after signing in (validated relative path). */
  next: string;
  /** "•••• 0100" or the email address, on the code step. */
  display?: string;
  lastInput?: string;
  error?: string;
  captchaRequired?: boolean;
};
