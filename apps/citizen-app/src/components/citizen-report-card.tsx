import {
  ChevronRight,
  Construction,
  Droplets,
  Lightbulb,
  Shapes,
  Trash2,
  Waves,
} from "lucide-react-native";
import type { ComponentType } from "react";
import { Pressable, StyleSheet } from "react-native";
import type { LucideProps } from "lucide-react-native";
import { caseStatusLabels, type CaseCategory, type CaseStatus } from "@/case-status";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { formatHomeRelativeTime, type CitizenCaseSummary } from "@/home-dashboard";
import { useColor } from "@/hooks/useColor";
import { useReadableLocation } from "@/hooks/use-readable-location";
import { formatReportNumber } from "@/report-display";

type Tone = { background: string; foreground: string };

const categoryIcons: Record<CaseCategory, ComponentType<LucideProps>> = {
  roads: Construction,
  sanitation: Trash2,
  water: Droplets,
  lighting: Lightbulb,
  drainage: Waves,
  other: Shapes,
};

export function CitizenReportCard({
  entry,
  now,
  onPress,
  standalone = false,
}: {
  entry: CitizenCaseSummary;
  now: number;
  onPress: () => void;
  standalone?: boolean;
}) {
  const Icon = categoryIcons[entry.category];
  const text = useColor("foreground");
  const muted = useColor("textMuted");
  const border = useColor("homeBorder");
  const surface = useColor("homeSurface");
  const blue = useColor("submittedAccent");
  const tones: Record<CaseStatus, Tone> = {
    new: { background: useColor("submittedTint"), foreground: blue },
    assigned: { background: useColor("assignedTint"), foreground: useColor("assignedAccent") },
    under_inspection: { background: useColor("progressTint"), foreground: useColor("progressAccent") },
    work_in_progress: { background: useColor("progressTint"), foreground: useColor("progressAccent") },
    awaiting_confirmation: { background: useColor("assignedTint"), foreground: useColor("assignedAccent") },
    resolved: { background: useColor("resolvedTint"), foreground: useColor("resolvedAccent") },
    disputed: { background: "#FEE2E2", foreground: "#DC2626" },
  };
  const categoryTones: Record<CaseCategory, Tone> = {
    roads: tones.new,
    sanitation: tones.resolved,
    water: tones.new,
    lighting: tones.assigned,
    drainage: tones.work_in_progress,
    other: tones.assigned,
  };
  const iconTone = categoryTones[entry.category];
  const statusTone = tones[entry.status];
  const readableLocation = useReadableLocation(entry.location);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${formatReportNumber(entry.reportNumber)}, ${entry.summary}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        standalone && styles.standalone,
        { backgroundColor: surface, borderColor: border, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: iconTone.background }]}>
        <Icon color={iconTone.foreground} size={29} strokeWidth={2.15} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={[styles.title, { color: text }]}>{entry.summary}</Text>
        <Text numberOfLines={1} style={[styles.location, { color: muted }]}>
          {readableLocation.label}
        </Text>
        <Text numberOfLines={1} style={[styles.reportNumber, { color: muted }]}>
          {formatReportNumber(entry.reportNumber)}
        </Text>
      </View>
      <View style={styles.trailing}>
        <View style={[styles.badge, { backgroundColor: statusTone.background }]}>
          <Text numberOfLines={1} style={[styles.badgeText, { color: statusTone.foreground }]}>
            {caseStatusLabels[entry.status]}
          </Text>
        </View>
        <View style={styles.trailingMeta}>
          <Text style={[styles.time, { color: muted }]}>{formatHomeRelativeTime(entry.submittedAt, now)}</Text>
          <ChevronRight color={muted} size={19} strokeWidth={2.3} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  standalone: { borderWidth: 1, borderRadius: 16 },
  icon: { width: 52, height: 52, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "700", lineHeight: 21 },
  location: { marginTop: 3, fontSize: 14, lineHeight: 18 },
  reportNumber: { marginTop: 1, fontSize: 13, lineHeight: 17 },
  trailing: { width: 96, alignItems: "flex-end", gap: 10 },
  trailingMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  badge: {
    maxWidth: 106,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 12, fontWeight: "700", lineHeight: 16, textAlign: "center" },
  time: { fontSize: 13, fontVariant: ["tabular-nums"] },
});
