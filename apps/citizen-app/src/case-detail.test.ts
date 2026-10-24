import { describe, expect, it } from "vitest";
import { caseMedia, statusStepState, timelineEntryTitle, type CitizenTimelineEntry } from "./case-detail";

describe("citizen case detail", () => {
  it("marks completed, current, and upcoming case stages", () => {
    expect(statusStepState("new", "under_inspection")).toBe("complete");
    expect(statusStepState("under_inspection", "under_inspection")).toBe("current");
    expect(statusStepState("resolved", "under_inspection")).toBe("upcoming");
  });

  it("keeps image and video evidence without inventing missing URLs", () => {
    expect(caseMedia([
      { attachmentId: "photo", mediaType: "image/jpeg", url: "https://example.com/photo.jpg" },
      { attachmentId: "missing", mediaType: "image/png", url: null },
      { attachmentId: "video", mediaType: "video/mp4", url: "https://example.com/video.mp4" },
      { attachmentId: "voice", mediaType: "audio/ogg", url: "https://example.com/voice.ogg" },
    ])).toEqual([
      { attachmentId: "photo", mediaType: "image/jpeg", url: "https://example.com/photo.jpg" },
      { attachmentId: "missing", mediaType: "image/png", url: null },
      { attachmentId: "video", mediaType: "video/mp4", url: "https://example.com/video.mp4" },
    ]);
  });

  it("writes concrete labels for every timeline event", () => {
    const base = { id: "event", actorName: "Asha Rao", occurredAt: 1 };
    const entries: CitizenTimelineEntry[] = [
      { ...base, event: { kind: "registered" } },
      { ...base, event: { kind: "assigned" } },
      { ...base, event: { kind: "priority_changed", from: "medium", to: "high" } },
      { ...base, event: { kind: "status_changed", from: "assigned", to: "under_inspection" } },
      { ...base, event: { kind: "resolved", from: "work_in_progress", to: "resolved", resolutionNote: "Fixed." } },
      { ...base, event: { kind: "resolution_submitted", resolutionNote: "Patched road.", evidenceCount: 1 } },
      { ...base, event: { kind: "citizen_confirmed", comment: "Great job!" } },
      { ...base, event: { kind: "citizen_disputed", comment: "Still leaking." } },
      { ...base, event: { kind: "case_reopened", reason: "Sending secondary crew." } },
      { ...base, event: { kind: "resolution_verified_by_officer", reason: "Site inspection complete." } },
    ];

    expect(entries.map(timelineEntryTitle)).toEqual([
      "Case registered",
      "Issue assigned",
      "Priority changed from Medium to High",
      "Moved to Under inspection",
      "Issue resolved",
      "Repair evidence submitted",
      "Resolution confirmed by you",
      "Resolution disputed by you",
      "Case reopened for rework",
      "Resolution verified by officer",
    ]);
  });
});
