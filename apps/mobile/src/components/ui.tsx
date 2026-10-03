/**
 * Small UI kit. Text scales with Dynamic Type (allowFontScaling is on by default; nothing has a
 * fixed height that would clip it), and every touch target is at least 44pt.
 */
import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { fonts, radius, TOUCH, useTheme } from "@/lib/theme";

export function Heading({ style, level = 1, ...rest }: TextProps & { level?: 1 | 2 | 3 }) {
  const { c } = useTheme();
  const size = level === 1 ? 30 : level === 2 ? 22 : 18;
  return (
    <Text
      accessibilityRole="header"
      {...rest}
      style={[{ color: c.foreground, fontFamily: level === 1 ? fonts.display : fonts.displayBold, fontSize: size, lineHeight: size * 1.15 }, style]}
    />
  );
}

export function Body({ style, muted, small, ...rest }: TextProps & { muted?: boolean; small?: boolean }) {
  const { c } = useTheme();
  return (
    <Text
      {...rest}
      style={[{ color: muted ? c.mutedForeground : c.foreground, fontSize: small ? 14 : 16, lineHeight: small ? 19 : 22 }, style]}
    />
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Text style={{ color: c.primary, fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>{children}</Text>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  style,
  icon,
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = variant === "primary" ? c.primary : variant === "secondary" ? c.secondary : variant === "danger" ? c.destructive : "transparent";
  const fg =
    variant === "primary" ? c.primaryForeground : variant === "secondary" ? c.secondaryForeground : variant === "danger" ? c.primaryForeground : c.primary;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      {...rest}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        variant === "ghost" && { paddingHorizontal: 8 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={{ color: fg, fontSize: 17, fontWeight: "700", textAlign: "center" }}>{title}</Text>
    </Pressable>
  );
}

export const TextField = forwardRef<TextInput, TextInputProps & { label: string; hint?: string }>(function TextField(
  { label, hint, style, ...rest },
  ref,
) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.foreground, fontWeight: "600", fontSize: 15 }}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={c.mutedForeground}
        {...rest}
        style={[
          {
            minHeight: 52,
            borderWidth: 1.5,
            borderColor: c.input,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 17,
            color: c.foreground,
            backgroundColor: c.card,
          },
          style,
        ]}
      />
      {hint ? <Body small muted>{hint}</Body> : null}
    </View>
  );
});

export function ErrorText({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: c.destructive, fontSize: 15, fontWeight: "600" }}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: "hidden" }, style]}>
      {children}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 10 }}>
      <Heading level={2} style={{ textAlign: "center" }}>
        {title}
      </Heading>
      {body ? (
        <Body muted style={{ textAlign: "center" }}>
          {body}
        </Body>
      ) : null}
      {action ? <View style={{ marginTop: 8, alignSelf: "stretch" }}>{action}</View> : null}
    </View>
  );
}

export function Chip({ label, tone = "muted" }: { label: string; tone?: "muted" | "accent" | "secondary" }) {
  const { c } = useTheme();
  const bg = tone === "accent" ? c.accent : tone === "secondary" ? c.secondary : c.muted;
  const fg = tone === "accent" ? c.accentForeground : tone === "secondary" ? c.secondaryForeground : c.mutedForeground;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: Math.max(TOUCH, 52),
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
