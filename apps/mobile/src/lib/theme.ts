/**
 * Design tokens mirrored from apps/web/src/app/globals.css (warm "postcard" palette: paper
 * background, sunset-coral primary, sea-teal secondary, vote colours). Keep the two in sync.
 */
import { useColorScheme } from "react-native";

export const light = {
  background: "#fbf7f2",
  foreground: "#1f1a17",
  card: "#ffffff",
  muted: "#f1eae2",
  mutedForeground: "#5e544c",
  primary: "#c2410c",
  primaryForeground: "#ffffff",
  primaryHover: "#a3370a",
  secondary: "#e3f1ed",
  secondaryForeground: "#0f4c45",
  accent: "#fde7d6",
  accentForeground: "#7a2a0a",
  destructive: "#b42318",
  border: "#e6ddd3",
  input: "#8c7f73",
  voteMust: "#c2410c",
  voteDown: "#0f766e",
  votePass: "#57534e",
  voteForeground: "#ffffff",
};

export type Palette = typeof light;

export const dark: Palette = {
  background: "#14110f",
  foreground: "#f4eee8",
  card: "#1e1a17",
  muted: "#2a2420",
  mutedForeground: "#b8aca1",
  primary: "#ff8a5c",
  primaryForeground: "#1f1a17",
  primaryHover: "#ffa47f",
  secondary: "#12302c",
  secondaryForeground: "#a7e3d8",
  accent: "#3a2418",
  accentForeground: "#ffc9a8",
  destructive: "#f97066",
  border: "#3a322c",
  input: "#7a6e64",
  voteMust: "#ff8a5c",
  voteDown: "#5ec2b5",
  votePass: "#b8aca1",
  voteForeground: "#1f1a17",
};

/** Headings use Bricolage Grotesque (loaded in the root layout); body text uses the system font. */
export const fonts = {
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24 };
/** Minimum touch target (Apple HIG 44pt). */
export const TOUCH = 44;

export function useTheme() {
  const scheme = useColorScheme();
  const c = scheme === "dark" ? dark : light;
  return { c, dark: scheme === "dark" };
}
