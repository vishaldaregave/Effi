import { useUser } from "@clerk/expo";
import { makeFunctionReference } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  CircleCheck,
  FileText,
  Search,
  UserRoundCheck,
  Wrench,
} from "lucide-react-native";
import { useEffect, useState, type ComponentType } from "react";
import { Pressable, ScrollView, StyleSheet } from "react-native";
import type { LucideProps } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CitizenReportCard } from "@/components/citizen-report-card";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import {
  citizenFirstName,
  countHomeOverview,
  greetingForHour,
  recentCitizenCases,
  type CitizenCaseSummary,
} from "@/home-dashboard";
import { useColor } from "@/hooks/useColor";

const viewerCases = makeFunctionReference<"query", Record<string, never>, CitizenCaseSummary[]>("citizen:viewerCases");
const ensureCitizenFn = makeFunctionReference<"mutation", Record<string, never>, unknown>("citizen:ensureCitizen");

type Tone = { background: string; foreground: string };

type MetricTileProps = {
  icon: ComponentType<LucideProps>;
  value: number | null;
  label: string;
  tone: Tone;
};

function MetricTile({ icon: Icon, value, label, tone }: MetricTileProps) {
  const surface = useColor("homeSurface");
  const border = useColor("homeBorder");
  const text = useColor("foreground");
  const muted = useColor("textMuted");

  return (
    <View
      accessible
      accessibilityLabel={value === null ? `${label}, loading` : `${label}, ${value}`}
      style={[styles.metricTile, { backgroundColor: surface, borderColor: border }]}
    >
      <View style={[styles.metricIcon, { backgroundColor: tone.background }]}>
        <Icon color={tone.foreground} size={29} strokeWidth={2.25} />
      </View>
      <Text style={[styles.metricValue, { color: text }]}>{value ?? "—"}</Text>
      <Text style={[styles.metricLabel, { color: muted }]}>{label}</Text>
    </View>
  );
}

export function MainTabScreen() {
  const router = useRouter();
  const { user } = useUser();
  const cases = useQuery(viewerCases);
  const ensureCitizen = useMutation(ensureCitizenFn);

  useEffect(() => {
    if (user) {
      ensureCitizen().catch(() => {});
    }
  }, [user, ensureCitizen]);

  const [now] = useState(() => Date.now());
  const overview = cases === undefined ? null : countHomeOverview(cases);
  const recentCases = cases === undefined ? [] : recentCitizenCases(cases);

  const navy = useColor("civicNavy");
  const navyMuted = useColor("civicNavyMuted");
  const headerForeground = useColor("civicHeaderForeground");
  const canvas = useColor("homeCanvas");
  const surface = useColor("homeSurface");
  const border = useColor("homeBorder");
  const text = useColor("foreground");
  const muted = useColor("textMuted");
  const blue = useColor("submittedAccent");

  const submittedTone = { background: useColor("submittedTint"), foreground: blue };
  const assignedTone = { background: useColor("assignedTint"), foreground: useColor("assignedAccent") };
  const progressTone = { background: useColor("progressTint"), foreground: useColor("progressAccent") };
  const resolvedTone = { background: useColor("resolvedTint"), foreground: useColor("resolvedAccent") };

  const greeting = greetingForHour(new Date(now).getHours());
  const firstName = citizenFirstName(user ? { firstName: user.firstName, username: user.username } : null);

  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: navy }]}>
      <StatusBar style="light" />
      <ScrollView
        style={{ backgroundColor: canvas }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { backgroundColor: navy }]}>
          <Text style={[styles.greeting, { color: navyMuted }]}>{greeting},</Text>
          <Text accessibilityRole="header" style={[styles.firstName, { color: headerForeground }]}>{firstName}</Text>
          <View
            accessible
            accessibilityLabel="Search is not available yet"
            style={[styles.searchPlaceholder, { backgroundColor: surface }]}
          >
            <Search color={muted} size={24} strokeWidth={2} />
            <Text numberOfLines={1} style={[styles.searchCopy, { color: muted }]}>Search reports, locations, departments...</Text>
          </View>
        </View>

        <View style={[styles.body, { backgroundColor: canvas }]}>
          <View style={styles.sectionHeading}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: text }]}>Overview</Text>
            <Text style={[styles.sectionMeta, { color: muted }]}>All reports</Text>
          </View>

          <View style={styles.metricGrid}>
            <MetricTile icon={FileText} value={overview?.submitted ?? null} label="Reports submitted" tone={submittedTone} />
            <MetricTile icon={UserRoundCheck} value={overview?.assigned ?? null} label="Assigned" tone={assignedTone} />
            <MetricTile icon={Wrench} value={overview?.inProgress ?? null} label="In progress" tone={progressTone} />
            <MetricTile icon={CircleCheck} value={overview?.resolved ?? null} label="Resolved" tone={resolvedTone} />
          </View>

          <View style={[styles.sectionHeading, styles.recentHeading]}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: text }]}>Recent reports</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all reports"
              hitSlop={12}
              onPress={() => router.push("/main/track")}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[styles.viewAll, { color: blue }]}>View all</Text>
            </Pressable>
          </View>

          <View style={[styles.reportList, { backgroundColor: surface, borderColor: border }]}>
            {cases === undefined ? (
              <View accessible accessibilityLabel="Loading recent reports" style={styles.messageState}>
                <Text style={[styles.messageTitle, { color: text }]}>Loading your reports</Text>
                <Text style={[styles.messageCopy, { color: muted }]}>Your latest updates will appear here.</Text>
              </View>
            ) : recentCases.length === 0 ? (
              <View style={styles.messageState}>
                <Text style={[styles.messageTitle, { color: text }]}>No reports yet</Text>
                <Text style={[styles.messageCopy, { color: muted }]}>Submit an issue and its live status will appear here.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/main/report")}
                  style={({ pressed }) => [styles.emptyAction, { backgroundColor: blue, opacity: pressed ? 0.72 : 1 }]}
                >
                  <Text style={[styles.emptyActionText, { color: headerForeground }]}>Report an issue</Text>
                </Pressable>
              </View>
            ) : (
              recentCases.map((entry) => (
                <CitizenReportCard
                  key={entry.caseId}
                  entry={entry}
                  now={now}
                  onPress={() => router.push({ pathname: "/cases/[caseId]", params: { caseId: entry.caseId } })}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 23,
    paddingBottom: 26,
  },
  greeting: {
    fontSize: 19,
    fontWeight: "500",
    lineHeight: 25,
  },
  firstName: {
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1.1,
    lineHeight: 45,
  },
  searchPlaceholder: {
    minHeight: 58,
    marginTop: 25,
    paddingHorizontal: 18,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchCopy: {
    flex: 1,
    fontSize: 16,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 32,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.55,
    lineHeight: 34,
  },
  sectionMeta: {
    fontSize: 16,
    fontWeight: "500",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 18,
  },
  metricTile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 154,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  metricIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    marginTop: 15,
    fontSize: 34,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 20,
  },
  recentHeading: {
    marginTop: 30,
    marginBottom: 16,
  },
  viewAll: {
    fontSize: 16,
    fontWeight: "700",
  },
  reportList: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 16,
  },
  messageState: {
    minHeight: 176,
    padding: 24,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  messageTitle: {
    fontSize: 19,
    fontWeight: "700",
  },
  messageCopy: {
    marginTop: 5,
    fontSize: 15,
    lineHeight: 21,
  },
  emptyAction: {
    minHeight: 44,
    marginTop: 18,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyActionText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
