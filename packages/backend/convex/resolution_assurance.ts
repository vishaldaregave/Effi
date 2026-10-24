import type { Id } from "./_generated/dataModel";

export type ResolutionRecommendation =
  | "supports_resolution"
  | "requires_review"
  | "insufficient_evidence"
  | "resolution_disputed";

export type EvidenceItem = {
  attachmentId: string;
  mediaType: string;
  storageId?: Id<"_storage"> | undefined;
  storageKey?: string | undefined;
};

export type LocationPoint = {
  latitude: number;
  longitude: number;
};

export type ResolutionAssessmentInput = {
  category: string;
  summary: string;
  resolutionNote: string;
  originalEvidence: readonly EvidenceItem[];
  completionEvidence: readonly EvidenceItem[];
  originalLocation: LocationPoint;
  completionLocation?: LocationPoint | undefined;
  visionEvaluator?: ((input: ResolutionAssessmentInput) => Promise<VisionEvaluationResult>) | undefined;
};

export type VisionEvaluationResult = {
  recommendation: ResolutionRecommendation;
  reasons: string[];
  uncertainty: number;
  provider: string;
  manualReviewRequired: boolean;
};

export type AiEvidenceAssessment = {
  recommendation: ResolutionRecommendation;
  reasons: string[];
  evidenceReferences: string[];
  uncertainty: number;
  assessedAt: number;
  provider: string;
  manualReviewRequired: boolean;
};

/**
 * Calculates geographic distance in meters between two GPS coordinates using the Haversine formula.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

const MAX_ACCEPTABLE_LOCATION_DRIFT_METERS = 500;
const MINIMUM_DESCRIPTIVE_NOTE_CHARS = 10;

/**
 * Evaluates completion evidence against the original complaint.
 * Combines deterministic checks (completeness, note depth, GPS proximity)
 * with the configured vision provider interface.
 */
export async function assessResolutionEvidence(
  input: ResolutionAssessmentInput,
): Promise<AiEvidenceAssessment> {
  const reasons: string[] = [];
  const evidenceReferences: string[] = [
    ...input.originalEvidence.map((e) => e.attachmentId),
    ...input.completionEvidence.map((e) => e.attachmentId),
  ];

  let recommendation: ResolutionRecommendation = "supports_resolution";
  let uncertainty = 0.15;
  let manualReviewRequired = false;
  let provider = "rule_based";

  // 1. Evidence Completeness Check
  if (input.completionEvidence.length === 0) {
    recommendation = "insufficient_evidence";
    reasons.push("No after-repair photos or completion media were submitted by the officer.");
    uncertainty = 0.85;
    manualReviewRequired = true;
  } else {
    reasons.push(
      `Officer submitted ${input.completionEvidence.length} after-repair completion evidence item(s).`,
    );
  }

  // 2. Completion Note Check
  const trimmedNote = input.resolutionNote.trim();
  if (trimmedNote.length < MINIMUM_DESCRIPTIVE_NOTE_CHARS) {
    if (recommendation !== "insufficient_evidence") {
      recommendation = "requires_review";
    }
    reasons.push("The completion note is too brief to confirm repair specifics.");
    uncertainty = Math.max(uncertainty, 0.6);
    manualReviewRequired = true;
  } else {
    reasons.push("Descriptive completion notes provided by the responsible officer.");
  }

  // 3. Geographic Proximity Check
  if (input.completionLocation) {
    const distanceMeters = haversineDistanceMeters(
      input.originalLocation.latitude,
      input.originalLocation.longitude,
      input.completionLocation.latitude,
      input.completionLocation.longitude,
    );

    const roundedDistance = Math.round(distanceMeters);
    if (distanceMeters > MAX_ACCEPTABLE_LOCATION_DRIFT_METERS) {
      if (recommendation !== "insufficient_evidence") {
        recommendation = "requires_review";
      }
      reasons.push(
        `Completion location is ${roundedDistance}m from the original reported complaint site (exceeds ${MAX_ACCEPTABLE_LOCATION_DRIFT_METERS}m threshold).`,
      );
      uncertainty = Math.max(uncertainty, 0.7);
      manualReviewRequired = true;
    } else {
      reasons.push(
        `Completion location verified within ${roundedDistance}m of the original reported site.`,
      );
    }
  }

  // 4. Vision Model / AI Assessment
  if (input.visionEvaluator) {
    try {
      const visionResult = await input.visionEvaluator(input);
      provider = visionResult.provider;
      reasons.push(...visionResult.reasons);
      uncertainty = Math.max(uncertainty, visionResult.uncertainty);
      if (visionResult.manualReviewRequired) {
        manualReviewRequired = true;
      }
      // Stricter recommendation takes precedence
      if (
        visionResult.recommendation === "insufficient_evidence" ||
        recommendation === "insufficient_evidence"
      ) {
        recommendation = "insufficient_evidence";
      } else if (
        visionResult.recommendation === "resolution_disputed" ||
        recommendation === "resolution_disputed"
      ) {
        recommendation = "resolution_disputed";
      } else if (
        visionResult.recommendation === "requires_review" ||
        recommendation === "requires_review"
      ) {
        recommendation = "requires_review";
      } else {
        recommendation = visionResult.recommendation;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Vision assessment failed";
      recommendation = "requires_review";
      reasons.push(`AI vision evaluation error: ${message}. Manual officer review required.`);
      uncertainty = Math.max(uncertainty, 0.65);
      manualReviewRequired = true;
      provider = "vision_error";
    }
  } else {
    // If no vision evaluator is provided and real provider credentials are absent
    if (input.completionEvidence.length > 0 && recommendation === "supports_resolution") {
      // Deterministic check passed, but without configured vision AI, require citizen confirmation
      provider = "rule_based";
      reasons.push("Automated visual comparison unavailable in this environment; awaiting citizen confirmation.");
      uncertainty = 0.35;
    }
  }

  return {
    recommendation,
    reasons,
    evidenceReferences,
    uncertainty: Number(uncertainty.toFixed(2)),
    assessedAt: Date.now(),
    provider,
    manualReviewRequired,
  };
}
