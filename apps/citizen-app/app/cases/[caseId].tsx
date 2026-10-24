import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { Image } from "expo-image";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  ImageOff,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  VideoOff,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  caseCategoryLabels,
  caseStatusDescriptions,
  caseStatusLabels,
  formatCaseTime,
  type CaseCategory,
  type CaseStatus,
} from "@/case-status";
import {
  caseMedia,
  timelineEntryTitle,
  type CitizenEvidence,
  type CitizenTimelineEntry,
} from "@/case-detail";
import { CaseLocationMap } from "@/components/case-location-map";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { useColor } from "@/hooks/useColor";
import { useReadableLocation } from "@/hooks/use-readable-location";
import { formatReportNumber } from "@/report-display";

type ViewerCaseDetail = {
  case: {
    caseId: string;
    reportId: string;
    reportNumber: string;
    summary: string;
    category: CaseCategory;
    status: CaseStatus;
    location: {
      source: "current_gps" | "selected_pin";
      latitude: number;
      longitude: number;
      place?: { name: string; formattedAddress: string };
    };
    submittedAt: number;
  };
  evidence: CitizenEvidence[];
  timeline: CitizenTimelineEntry[];
  latestResolution?: {
    resolutionId: string;
    officerName: string;
    resolutionNote: string;
    submittedAt: number;
    evidence: CitizenEvidence[];
    aiAssessment?: {
      recommendation: string;
      confidence: number;
      reasons: string[];
      provider: string;
      manualReviewRequired: boolean;
      assessedAt: number;
    };
    citizenConfirmation?: {
      verdict: "confirmed" | "disputed";
      respondedAt: number;
      comment?: string;
    };
  } | null;
};

const viewerCase = makeFunctionReference<
  "query",
  { caseId: string },
  ViewerCaseDetail | null
>("citizen:viewerCase");

const confirmResolutionMutation = makeFunctionReference<
  "mutation",
  { caseId: string; verdict: "confirmed" | "disputed"; comment?: string },
  { status: CaseStatus; verdict: "confirmed" | "disputed" }
>("citizen:confirmResolution");

type Tone = { background: string; foreground: string };

const progressSteps: { key: CaseStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "assigned", label: "Assigned" },
  { key: "work_in_progress", label: "In progress" },
  { key: "awaiting_confirmation", label: "Verification" },
  { key: "resolved", label: "Resolved" },
];

function stepStateForCase(
  stepKey: CaseStatus,
  currentStatus: CaseStatus,
): "complete" | "current" | "disputed" | "upcoming" {
  if (currentStatus === "resolved") return "complete";

  if (currentStatus === "disputed") {
    if (stepKey === "awaiting_confirmation") return "disputed";
    if (stepKey === "resolved") return "upcoming";
    return "complete";
  }

  if (currentStatus === "awaiting_confirmation") {
    if (stepKey === "awaiting_confirmation") return "current";
    if (stepKey === "resolved") return "upcoming";
    return "complete";
  }

  const order: CaseStatus[] = ["new", "assigned", "under_inspection", "work_in_progress"];
  const currentIdx = order.indexOf(currentStatus);
  const stepIdx = progressSteps.findIndex((s) => s.key === stepKey);

  if (stepIdx < currentIdx || (currentIdx === -1 && stepIdx < 3)) return "complete";
  if (stepIdx === currentIdx) return "current";
  return "upcoming";
}

function StatusProgress({ status }: { status: CaseStatus }) {
  const surface = useColor("homeSurface");
  const border = useColor("homeBorder");
  const text = useColor("foreground");
  const muted = useColor("textMuted");
  const blue = useColor("submittedAccent");
  const resolved = useColor("resolvedAccent");
  const danger = "#DC2626";
  const accent = status === "resolved" ? resolved : status === "disputed" ? danger : blue;

  return (
    <View
      accessible
      accessibilityLabel={`Current status: ${caseStatusLabels[status]}`}
      style={[styles.statusCard, { backgroundColor: surface, borderColor: border }]}
    >
      <View style={styles.statusHeading}>
        <Text style={styles.sectionTitle}>Status</Text>
        <Text style={[styles.currentStatus, { color: accent }]}>{caseStatusLabels[status]}</Text>
      </View>
      <View style={styles.statusSteps}>
        {progressSteps.map((step, index) => {
          const state = stepStateForCase(step.key, status);
          const reached = state !== "upcoming";
          const dotColor = state === "disputed" ? danger : reached ? accent : surface;
          const borderColor = state === "disputed" ? danger : reached ? accent : border;

          return (
            <View key={step.key} style={styles.statusStep}>
              <View style={styles.statusTrack}>
                {index > 0 ? (
                  <View
                    style={[
                      styles.connector,
                      styles.connectorLeft,
                      { backgroundColor: reached ? accent : border },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: dotColor, borderColor: borderColor },
                  ]}
                >
                  {state === "complete" ? <Check color={surface} size={12} strokeWidth={3} /> : null}
                  {state === "current" ? (
                    <View style={[styles.currentDot, { backgroundColor: surface }]} />
                  ) : null}
                  {state === "disputed" ? <AlertCircle color={surface} size={12} strokeWidth={3} /> : null}
                </View>
                {index < progressSteps.length - 1 ? (
                  <View
                    style={[
                      styles.connector,
                      styles.connectorRight,
                      { backgroundColor: reached && state !== "current" && state !== "disputed" ? accent : border },
                    ]}
                  />
                ) : null}
              </View>
              <Text
                style={[
                  styles.statusLabel,
                  {
                    color:
                      state === "current"
                        ? text
                        : state === "disputed"
                          ? danger
                          : muted,
                    fontWeight: state === "current" || state === "disputed" ? "700" : "500",
                  },
                ]}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CaseVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url);

  return (
    <VideoView
      accessibilityLabel="Case video evidence"
      player={player}
      style={styles.evidenceImage}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}

function EvidenceTile({ entry, width }: { entry: CitizenEvidence; width: number }) {
  const [failed, setFailed] = useState(false);
  const border = useColor("homeBorder");
  const surface = useColor("homeSurface");
  const muted = useColor("textMuted");
  const mediaUrl = failed ? null : entry.url;
  const isVideo = entry.mediaType.toLowerCase().startsWith("video/");

  return (
    <View style={[styles.evidenceTile, { width, backgroundColor: surface, borderColor: border }]}>
      {mediaUrl === null ? (
        <View
          accessible
          accessibilityLabel={`Case ${isVideo ? "video" : "image"} unavailable`}
          style={styles.evidenceUnavailable}
        >
          {isVideo ? (
            <VideoOff color={muted} size={28} strokeWidth={1.8} />
          ) : (
            <ImageOff color={muted} size={28} strokeWidth={1.8} />
          )}
          <Text style={[styles.evidenceUnavailableText, { color: muted }]}>
            {isVideo ? "Video unavailable" : "Image unavailable"}
          </Text>
        </View>
      ) : isVideo ? (
        <CaseVideo url={mediaUrl} />
      ) : (
        <Image
          accessibilityLabel="Case evidence"
          source={{ uri: mediaUrl }}
          style={styles.evidenceImage}
          contentFit="cover"
          transition={150}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

function EvidenceGallery({
  evidence,
  title = "Case media",
}: {
  evidence: readonly CitizenEvidence[];
  title?: string;
}) {
  const { width } = useWindowDimensions();
  const media = caseMedia(evidence);
  const muted = useColor("textMuted");
  const surface = useColor("homeSurface");
  const border = useColor("homeBorder");
  const tileWidth = media.length === 1 ? Math.max(240, width - 40) : Math.min(270, width * 0.72);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={[styles.sectionCount, { color: muted }]}>{media.length}</Text>
      </View>
      {media.length === 0 ? (
        <View style={[styles.emptyMedia, { backgroundColor: surface, borderColor: border }]}>
          <ImageOff color={muted} size={28} strokeWidth={1.8} />
          <Text style={[styles.emptyMediaText, { color: muted }]}>No case media is available.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.evidenceRow}
        >
          {media.map((entry) => (
            <EvidenceTile key={entry.attachmentId} entry={entry} width={tileWidth} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function CitizenConfirmationCard({
  caseId,
  status,
  resolution,
}: {
  caseId: string;
  status: CaseStatus;
  resolution?: ViewerCaseDetail["latestResolution"];
}) {
  const confirmResolution = useMutation(confirmResolutionMutation);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeComment, setDisputeComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const surface = useColor("homeSurface");
  const border = useColor("homeBorder");
  const text = useColor("foreground");
  const muted = useColor("textMuted");
  const green = useColor("resolvedAccent");
  const greenTint = useColor("resolvedTint");

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await confirmResolution({
        caseId,
        verdict: "confirmed",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Confirmation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispute = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await confirmResolution({
        caseId,
        verdict: "disputed",
        ...(disputeComment.trim() ? { comment: disputeComment.trim() } : {}),
      });
      setShowDisputeForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dispute submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If waiting for citizen response
  if (status === "awaiting_confirmation") {
    return (
      <View style={[styles.confirmationCard, { backgroundColor: surface, borderColor: "#F59E0B" }]}>
        <View style={styles.confirmationHeader}>
          <View style={styles.confirmationTitleRow}>
            <CircleAlert color="#D97706" size={20} strokeWidth={2.4} />
            <Text style={styles.confirmationHeading}>Has this issue actually been fixed?</Text>
          </View>
          <Text style={[styles.confirmationSubtext, { color: muted }]}>
            The assigned officer has completed work on this issue. Please check the site and confirm.
          </Text>
        </View>

        {resolution?.resolutionNote ? (
          <View style={[styles.noteBox, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
            <Text style={styles.noteLabel}>Officer completion note</Text>
            <Text style={[styles.noteContent, { color: text }]}>{resolution.resolutionNote}</Text>
          </View>
        ) : null}

        {resolution?.evidence && resolution.evidence.length > 0 ? (
          <View style={styles.resolutionPhotosWrapper}>
            <Text style={[styles.photosLabel, { color: muted }]}>After-repair photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidenceRow}>
              {resolution.evidence.map((item) => (
                <View
                  key={item.attachmentId}
                  style={[styles.smallPhotoThumb, { borderColor: border }]}
                >
                  {item.url ? (
                    <Image source={{ uri: item.url }} style={styles.fillImage} contentFit="cover" />
                  ) : (
                    <ImageOff color={muted} size={16} />
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {resolution?.aiAssessment ? (
          <View style={styles.aiBadgeRow}>
            <Sparkles color="#6366F1" size={14} />
            <Text style={styles.aiBadgeText}>
              AI evidence check: {resolution.aiAssessment.recommendation.replace(/_/g, " ")}
            </Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!showDisputeForm ? (
          <View style={styles.actionButtonsRow}>
            <Pressable
              style={[styles.confirmButton, isSubmitting ? styles.buttonDisabled : null]}
              onPress={handleConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Check color="#FFFFFF" size={16} strokeWidth={3} />
                  <Text style={styles.confirmButtonText}>Yes, it's fixed</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.disputeButton, isSubmitting ? styles.buttonDisabled : null]}
              onPress={() => setShowDisputeForm(true)}
              disabled={isSubmitting}
            >
              <Text style={styles.disputeButtonText}>No, the issue remains</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.disputeForm}>
            <Text style={styles.disputeFormTitle}>Explain what still remains</Text>
            <TextInput
              style={[styles.disputeInput, { borderColor: border, color: text }]}
              placeholder="Tell the officer what was missed (optional)"
              placeholderTextColor={muted}
              multiline
              maxLength={400}
              value={disputeComment}
              onChangeText={setDisputeComment}
            />
            <View style={styles.disputeFormActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setShowDisputeForm(false)}
                disabled={isSubmitting}
              >
                <Text style={[styles.cancelButtonText, { color: muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitDisputeButton, isSubmitting ? styles.buttonDisabled : null]}
                onPress={handleDispute}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitDisputeButtonText}>Submit report dispute</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }

  // If citizen already confirmed
  if (status === "resolved" && resolution?.citizenConfirmation?.verdict === "confirmed") {
    return (
      <View style={[styles.feedbackCard, { backgroundColor: greenTint, borderColor: green }]}>
        <View style={styles.feedbackTitleRow}>
          <CircleCheck color={green} size={20} strokeWidth={2.4} />
          <Text style={[styles.feedbackHeading, { color: green }]}>
            You confirmed this resolution
          </Text>
        </View>
        {resolution.citizenConfirmation.comment ? (
          <Text style={[styles.feedbackComment, { color: text }]}>
            "{resolution.citizenConfirmation.comment}"
          </Text>
        ) : null}
        <Text style={[styles.feedbackTimestamp, { color: muted }]}>
          Confirmed on {formatCaseTime(resolution.citizenConfirmation.respondedAt)}
        </Text>
      </View>
    );
  }

  // If citizen disputed
  if (status === "disputed") {
    return (
      <View style={[styles.feedbackCard, { backgroundColor: "#FEF2F2", borderColor: "#EF4444" }]}>
        <View style={styles.feedbackTitleRow}>
          <ShieldAlert color="#DC2626" size={20} strokeWidth={2.4} />
          <Text style={[styles.feedbackHeading, { color: "#DC2626" }]}>
            You flagged that this issue remains
          </Text>
        </View>
        <Text style={[styles.feedbackSubtext, { color: text }]}>
          Your feedback has been sent to the responsible department for rework and supervisor review.
        </Text>
        {resolution?.citizenConfirmation?.comment ? (
          <Text style={[styles.feedbackComment, { color: text }]}>
            "{resolution.citizenConfirmation.comment}"
          </Text>
        ) : null}
      </View>
    );
  }

  return null;
}

function Timeline({ entries }: { entries: readonly CitizenTimelineEntry[] }) {
  const surface = useColor("homeSurface");
  const border = useColor("homeBorder");
  const text = useColor("foreground");
  const muted = useColor("textMuted");
  const green = useColor("resolvedAccent");
  const greenTint = useColor("resolvedTint");

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Timeline and actions taken</Text>
        <Text style={[styles.sectionCount, { color: muted }]}>{entries.length}</Text>
      </View>
      <View style={[styles.timelineCard, { backgroundColor: surface, borderColor: border }]}>
        {entries.map((entry, index) => (
          <View key={entry.id} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View style={[styles.timelineMarker, { backgroundColor: greenTint }]}>
                <CircleCheck color={green} size={18} strokeWidth={2.4} />
              </View>
              {index < entries.length - 1 ? (
                <View style={[styles.timelineLine, { backgroundColor: border }]} />
              ) : null}
            </View>
            <View
              style={[
                styles.timelineCopy,
                index < entries.length - 1 ? { borderBottomColor: border, borderBottomWidth: 1 } : null,
              ]}
            >
              <Text style={[styles.timelineTitle, { color: text }]}>{timelineEntryTitle(entry)}</Text>
              <Text style={[styles.timelineMeta, { color: muted }]}>
                {formatCaseTime(entry.occurredAt)}, {entry.actorName}
              </Text>
              {entry.event.kind === "resolved" ? (
                <Text style={[styles.resolutionNote, { color: text, backgroundColor: greenTint }]}>
                  {entry.event.resolutionNote}
                </Text>
              ) : null}
              {entry.event.kind === "resolution_submitted" ? (
                <Text style={[styles.resolutionNote, { color: text, backgroundColor: "#FFFBEB" }]}>
                  {entry.event.resolutionNote}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function DetailLoading() {
  const canvas = useColor("homeCanvas");
  const surface = useColor("homeSurface");
  const border = useColor("homeBorder");
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: canvas }]}>
      <View accessible accessibilityLabel="Loading report details" style={styles.loadingContent}>
        <View style={[styles.loadingHeader, { backgroundColor: border }]} />
        <View style={[styles.loadingStatus, { backgroundColor: surface, borderColor: border }]} />
        <View style={[styles.loadingImage, { backgroundColor: border }]} />
        <View style={[styles.loadingMap, { backgroundColor: surface, borderColor: border }]} />
      </View>
    </SafeAreaView>
  );
}

function CaseDetail({ caseId }: { caseId: string }) {
  const router = useRouter();
  const detail = useQuery(viewerCase, { caseId });
  const canvas = useColor("homeCanvas");
  const surface = useColor("homeSurface");
  const border = useColor("homeBorder");
  const text = useColor("foreground");
  const muted = useColor("textMuted");
  const blue = useColor("submittedAccent");
  const blueTint = useColor("submittedTint");
  const assignedTint = useColor("assignedTint");
  const assignedAccent = useColor("assignedAccent");
  const progressTint = useColor("progressTint");
  const progressAccent = useColor("progressAccent");
  const resolvedTint = useColor("resolvedTint");
  const resolvedAccent = useColor("resolvedAccent");

  const statusTones: Record<CaseStatus, Tone> = {
    new: { background: blueTint, foreground: blue },
    assigned: { background: assignedTint, foreground: assignedAccent },
    under_inspection: { background: progressTint, foreground: progressAccent },
    work_in_progress: { background: progressTint, foreground: progressAccent },
    awaiting_confirmation: { background: assignedTint, foreground: assignedAccent },
    resolved: { background: resolvedTint, foreground: resolvedAccent },
    disputed: { background: "#FEE2E2", foreground: "#DC2626" },
  };

  const readableLocation = useReadableLocation(detail?.case.location ?? null);

  if (detail === undefined) return <DetailLoading />;

  if (detail === null) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: canvas }]}>
        <StatusBar style="auto" />
        <View style={styles.unavailableContent}>
          <View style={styles.header}>
            <Button variant="ghost" size="icon" haptic={false} onPress={() => router.back()} icon={ArrowLeft} />
            <Text style={[styles.headerTitle, { color: text }]}>Report details</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={[styles.unavailableCard, { backgroundColor: surface, borderColor: border }]}>
            <ShieldCheck color={blue} size={34} strokeWidth={1.8} />
            <Text style={styles.unavailableTitle}>Report not available</Text>
            <Text style={[styles.unavailableCopy, { color: muted }]}>
              This report is not linked to your account, or it no longer exists.
            </Text>
            <Button variant="secondary" onPress={() => router.replace("/main/track")}>
              Back to my reports
            </Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const record = detail.case;
  const statusTone = statusTones[record.status] ?? statusTones.new;

  return (
    <SafeAreaView edges={["top"]} style={[styles.flex, { backgroundColor: canvas }]}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Button variant="ghost" size="icon" haptic={false} onPress={() => router.back()} icon={ArrowLeft} />
          <Text accessibilityRole="header" style={[styles.headerTitle, { color: text }]}>
            Report details
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.currentBanner, { backgroundColor: statusTone.background }]}>
          {record.status === "resolved" ? (
            <CircleCheck color={statusTone.foreground} size={24} strokeWidth={2.25} />
          ) : record.status === "disputed" ? (
            <ShieldAlert color={statusTone.foreground} size={24} strokeWidth={2.15} />
          ) : (
            <ShieldCheck color={statusTone.foreground} size={24} strokeWidth={2.15} />
          )}
          <View style={styles.currentBannerCopy}>
            <Text style={[styles.currentBannerTitle, { color: statusTone.foreground }]}>
              {caseStatusLabels[record.status]}
            </Text>
            <Text style={[styles.currentBannerText, { color: statusTone.foreground }]}>
              {caseStatusDescriptions[record.status]}
            </Text>
          </View>
        </View>

        <StatusProgress status={record.status} />

        {/* Citizen verification and assurance interactive card */}
        <CitizenConfirmationCard
          caseId={caseId}
          status={record.status}
          resolution={detail.latestResolution}
        />

        <View style={styles.reportIntro}>
          <View style={styles.reportMetaRow}>
            <Text numberOfLines={1} style={[styles.reportNumber, { color: muted }]}>
              {formatReportNumber(record.reportNumber)}
            </Text>
            <Text style={[styles.reportDate, { color: muted }]}>
              Submitted {formatCaseTime(record.submittedAt)}
            </Text>
          </View>
          <Text accessibilityRole="header" style={[styles.reportTitle, { color: text }]}>
            {record.summary}
          </Text>
          <View style={styles.reportFacts}>
            <Text style={[styles.reportFact, { color: muted }]}>{caseCategoryLabels[record.category]}</Text>
            <View style={[styles.factDivider, { backgroundColor: border }]} />
            <MapPin color={muted} size={16} strokeWidth={2} />
            <Text style={[styles.reportFact, { color: muted }]}>{readableLocation.label}</Text>
          </View>
        </View>

        <EvidenceGallery evidence={detail.evidence} title="Original evidence" />

        {detail.latestResolution?.evidence && detail.latestResolution.evidence.length > 0 ? (
          <EvidenceGallery
            evidence={detail.latestResolution.evidence}
            title="After-repair completion photos"
          />
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>Exact location</Text>
            <Text numberOfLines={1} style={[styles.sectionCount, { color: muted }]}>
              {readableLocation.label}
            </Text>
          </View>
          {record.location.place ? (
            <View style={styles.placeDetails}>
              <View style={[styles.placeIcon, { backgroundColor: blueTint }]}>
                <MapPin color={blue} size={18} strokeWidth={2.2} />
              </View>
              <View style={styles.placeCopy}>
                <Text style={[styles.placeName, { color: text }]}>{record.location.place.name}</Text>
                <Text style={[styles.placeAddress, { color: muted }]}>
                  {record.location.place.formattedAddress}
                </Text>
              </View>
            </View>
          ) : null}
          <CaseLocationMap
            latitude={record.location.latitude}
            longitude={record.location.longitude}
            label={readableLocation.label}
          />
        </View>

        <Timeline entries={detail.timeline} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function CaseDetailScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();

  if (!isLoaded) return <DetailLoading />;
  if (!isSignedIn) return <Redirect href="/" />;
  if (!caseId) return <Redirect href="/main/track" />;
  return <CaseDetail caseId={caseId} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 44 },
  header: { minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
  headerSpacer: { width: 48 },
  currentBanner: {
    minHeight: 72,
    marginTop: 8,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  currentBannerCopy: { flex: 1, gap: 2 },
  currentBannerTitle: { fontSize: 18, fontWeight: "800" },
  currentBannerText: { fontSize: 13, lineHeight: 18, opacity: 0.82 },
  statusCard: { marginTop: 12, padding: 16, borderWidth: 1, borderRadius: 16 },
  statusHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  currentStatus: { fontSize: 14, fontWeight: "700" },
  statusSteps: { marginTop: 18, flexDirection: "row" },
  statusStep: { flex: 1, alignItems: "center" },
  statusTrack: { width: "100%", height: 20, alignItems: "center", justifyContent: "center" },
  statusDot: {
    zIndex: 1,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  currentDot: { width: 6, height: 6, borderRadius: 3 },
  connector: { position: "absolute", top: 9, height: 2, width: "50%" },
  connectorLeft: { left: 0 },
  connectorRight: { right: 0 },
  statusLabel: {
    minHeight: 34,
    marginTop: 7,
    paddingHorizontal: 2,
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
  },
  reportIntro: { paddingTop: 24 },
  reportMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  reportNumber: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  reportDate: { flex: 1, fontSize: 12, textAlign: "right" },
  reportTitle: { marginTop: 10, fontSize: 27, fontWeight: "800", letterSpacing: -0.55, lineHeight: 33 },
  reportFacts: { marginTop: 10, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  reportFact: { fontSize: 14, fontWeight: "500", fontVariant: ["tabular-nums"] },
  factDivider: { width: 1, height: 14 },
  placeDetails: { marginBottom: 12, flexDirection: "row", alignItems: "flex-start", gap: 11 },
  placeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  placeCopy: { flex: 1, gap: 2 },
  placeName: { fontSize: 16, fontWeight: "700", lineHeight: 21 },
  placeAddress: { fontSize: 13, lineHeight: 18 },
  section: { marginTop: 28 },
  sectionHeadingRow: {
    minHeight: 28,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: { flexShrink: 1, fontSize: 19, fontWeight: "800", letterSpacing: -0.25 },
  sectionCount: { flexShrink: 1, fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"], textAlign: "right" },
  evidenceRow: { gap: 10 },
  evidenceTile: { height: 214, overflow: "hidden", borderWidth: 1, borderRadius: 16 },
  evidenceImage: { width: "100%", height: "100%" },
  evidenceUnavailable: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9 },
  evidenceUnavailableText: { fontSize: 14, fontWeight: "600" },
  emptyMedia: { minHeight: 150, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyMediaText: { fontSize: 14 },
  timelineCard: { overflow: "hidden", borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingTop: 18 },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineRail: { width: 34, alignItems: "center" },
  timelineMarker: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  timelineLine: { width: 2, flex: 1, minHeight: 30, marginVertical: 4 },
  timelineCopy: { flex: 1, minHeight: 76, paddingTop: 3, paddingBottom: 17 },
  timelineTitle: { fontSize: 16, fontWeight: "700", lineHeight: 21 },
  timelineMeta: { marginTop: 4, fontSize: 12, lineHeight: 17 },
  resolutionNote: { marginTop: 10, overflow: "hidden", borderRadius: 10, padding: 11, fontSize: 14, lineHeight: 20 },
  loadingContent: { padding: 20, gap: 16 },
  loadingHeader: { width: "42%", height: 24, alignSelf: "center", borderRadius: 8 },
  loadingStatus: { height: 164, marginTop: 20, borderWidth: 1, borderRadius: 16 },
  loadingImage: { height: 214, borderRadius: 16 },
  loadingMap: { height: 224, borderWidth: 1, borderRadius: 16 },
  unavailableContent: { flex: 1, paddingHorizontal: 20 },
  unavailableCard: { marginTop: 48, padding: 24, borderWidth: 1, borderRadius: 16, alignItems: "center", gap: 14 },
  unavailableTitle: { fontSize: 21, fontWeight: "800" },
  unavailableCopy: { maxWidth: 300, fontSize: 14, lineHeight: 20, textAlign: "center" },

  // Citizen Resolution Card styles
  confirmationCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 16,
    borderWidth: 2,
    gap: 12,
  },
  confirmationHeader: { gap: 4 },
  confirmationTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  confirmationHeading: { fontSize: 17, fontWeight: "800", color: "#111827", flex: 1 },
  confirmationSubtext: { fontSize: 13, lineHeight: 18 },
  noteBox: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 4 },
  noteLabel: { fontSize: 11, fontWeight: "700", color: "#B45309", textTransform: "uppercase" },
  noteContent: { fontSize: 14, lineHeight: 20 },
  resolutionPhotosWrapper: { gap: 6 },
  photosLabel: { fontSize: 12, fontWeight: "600" },
  smallPhotoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  fillImage: { width: "100%", height: "100%" },
  aiBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#EEF2FF",
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  aiBadgeText: { fontSize: 11, fontWeight: "600", color: "#4F46E5" },
  errorText: { fontSize: 12, color: "#DC2626", fontWeight: "600" },
  actionButtonsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  confirmButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: "#059669",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
  },
  confirmButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  disputeButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#DC2626",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  disputeButtonText: { color: "#DC2626", fontSize: 13, fontWeight: "700" },
  buttonDisabled: { opacity: 0.6 },
  disputeForm: { marginTop: 4, gap: 10 },
  disputeFormTitle: { fontSize: 13, fontWeight: "700", color: "#DC2626" },
  disputeInput: {
    minHeight: 70,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    textAlignVertical: "top",
    backgroundColor: "#FFFFFF",
  },
  disputeFormActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancelButton: { minHeight: 36, paddingHorizontal: 12, justifyContent: "center" },
  cancelButtonText: { fontSize: 13, fontWeight: "600" },
  submitDisputeButton: {
    minHeight: 36,
    backgroundColor: "#DC2626",
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  submitDisputeButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  feedbackCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 6,
  },
  feedbackTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  feedbackHeading: { fontSize: 16, fontWeight: "800", flex: 1 },
  feedbackSubtext: { fontSize: 13, lineHeight: 18 },
  feedbackComment: { fontSize: 13, fontStyle: "italic", marginTop: 2 },
  feedbackTimestamp: { fontSize: 11, marginTop: 4 },
});
