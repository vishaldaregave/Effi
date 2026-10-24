import { StyleSheet } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { useColor } from "@/hooks/useColor";
import {
  casePriorityLabels,
  caseStatusLabels,
  caseStatuses,
  type CasePriority,
  type CaseStatus,
} from "@/case-status-data";

export {
  caseCategories,
  caseCategoryLabels,
  casePriorities,
  casePriorityLabels,
  caseStatusDescriptions,
  caseStatuses,
  caseStatusLabels,
  type CaseCategory,
  type CasePriority,
  type CaseStatus,
} from "@/case-status-data";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success";

const statusVariants: Record<CaseStatus, BadgeVariant> = {
  new: "default",
  assigned: "secondary",
  under_inspection: "secondary",
  work_in_progress: "outline",
  awaiting_confirmation: "secondary",
  resolved: "success",
  disputed: "destructive",
};

const priorityVariants: Record<CasePriority, BadgeVariant> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <Badge variant={statusVariants[status]}>{caseStatusLabels[status]}</Badge>;
}

export function CasePriorityBadge({ priority }: { priority: CasePriority }) {
  return <Badge variant={priorityVariants[priority]}>{casePriorityLabels[priority]}</Badge>;
}

export function CaseStatusTimeline({ status }: { status: CaseStatus }) {
  const primary = useColor("primary");
  const border = useColor("border");
  const text = useColor("text");
  const muted = useColor("textMuted");
  const currentIndex = caseStatuses.indexOf(status);

  return (
    <View>
      {caseStatuses.map((step, index) => {
        const reached = index <= currentIndex;
        return (
          <View key={step} style={styles.step}>
            <View style={styles.marker}>
              <View style={[styles.dot, { backgroundColor: reached ? primary : border }]} />
              {index < caseStatuses.length - 1 ? (
                <View style={[styles.line, { backgroundColor: index < currentIndex ? primary : border }]} />
              ) : null}
            </View>
            <View style={styles.stepCopy}>
              <Text style={{ color: reached ? text : muted }}>{caseStatusLabels[step]}</Text>
              {index === currentIndex ? (
                <Text variant="caption">Current status</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export const formatCaseTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const styles = StyleSheet.create({
  step: {
    flexDirection: "row",
    gap: 12,
  },
  marker: {
    alignItems: "center",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  line: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  stepCopy: {
    flex: 1,
    paddingBottom: 16,
  },
});
