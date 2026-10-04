/**
 * Six code boxes backed by one hidden TextInput, so iOS one-time-code autofill and Android SMS
 * autofill fill all six at once. Calls onComplete as soon as 6 digits are in (auto-submit).
 */
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { sanitizeCode } from "@/lib/phone";
import { radius, useTheme } from "@/lib/theme";

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const ref = useRef<TextInput>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <Pressable onPress={() => ref.current?.focus()} accessible={false}>
      <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Array.from({ length: 6 }, (_, i) => {
          const ch = value[i] ?? "";
          const active = i === Math.min(value.length, 5) && !disabled;
          return (
            <View key={i} style={[styles.box, { borderColor: active ? c.primary : c.input, backgroundColor: c.card }]}>
              <Text style={{ fontSize: 26, fontWeight: "700", color: c.foreground }} maxFontSizeMultiplier={1.4}>
                {ch}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        editable={!disabled}
        onChangeText={(t) => {
          const v = sanitizeCode(t);
          onChange(v);
          if (v.length === 6) onComplete(v);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        accessibilityLabel="6-digit code"
        style={styles.hidden}
        caretHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  box: { flex: 1, aspectRatio: 0.8, maxWidth: 56, minHeight: 56, borderWidth: 2, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  // Kept on screen (not display:none) so autofill and VoiceOver still find it.
  hidden: { position: "absolute", width: "100%", height: "100%", opacity: 0.02, color: "transparent" },
});
