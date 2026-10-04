/** Optional date: iOS compact picker inline; Android opens the system dialog. */
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Platform, Pressable, Text, View } from "react-native";
import { shortDate } from "@/lib/dates";
import { radius, useTheme } from "@/lib/theme";

export function DateField({
  label,
  value,
  onChange,
  minimumDate,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  minimumDate?: Date;
}) {
  const { c, dark } = useTheme();
  const shown = value ?? minimumDate ?? new Date();

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: c.foreground, fontWeight: "600", fontSize: 15 }}>{label}</Text>
      {Platform.OS === "ios" && value ? (
        <View style={{ flexDirection: "row", alignItems: "center", minHeight: 52 }}>
          <DateTimePicker
            value={shown}
            mode="date"
            display="compact"
            minimumDate={minimumDate}
            themeVariant={dark ? "dark" : "light"}
            accentColor={c.primary}
            onValueChange={(_, d) => onChange(d)}
            accessibilityLabel={label}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? shortDate(value) : "not set"}`}
          onPress={() => {
            if (Platform.OS === "android") {
              DateTimePickerAndroid.open({
                value: shown,
                mode: "date",
                minimumDate,
                onValueChange: (_, d) => onChange(d),
              });
            } else onChange(shown);
          }}
          style={{
            minHeight: 52,
            borderWidth: 1.5,
            borderColor: c.input,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            justifyContent: "center",
            backgroundColor: c.card,
          }}
        >
          <Text style={{ color: value ? c.foreground : c.mutedForeground, fontSize: 17 }}>{value ? shortDate(value) : "Add"}</Text>
        </Pressable>
      )}
    </View>
  );
}
