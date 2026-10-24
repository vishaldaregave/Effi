import { describe, expect, it } from "vitest";
import { inputRequestTranscriptEntries } from "../agent/lib/transcript.js";

const event = (requests: any) => ({
  meta: { id: "evt_1", at: "2026-09-11T04:43:00.000Z" },
  data: { requests },
});

describe("input request transcript entries", () => {
  it("unwraps a JSON-enveloped prompt and lowercases option ids", () => {
    const entries = inputRequestTranscriptEntries(event([{
      requestId: "call_1",
      prompt: '{"prompt": "Here is your report:\\nIssue: pothole on my main road\\nPlease confirm."}',
      options: [
        { id: "confirm", label: "Confirm" },
        { id: "Edit", label: "Edit" },
      ],
      allowFreeform: true,
    }]));

    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe("Here is your report:\nIssue: pothole on my main road\nPlease confirm.");
    expect(entries[0]!.inputRequest).toEqual({
      requestId: "call_1",
      prompt: "Here is your report:\nIssue: pothole on my main road\nPlease confirm.",
      options: [{ id: "confirm", label: "Confirm" }, { id: "edit", label: "Edit" }],
      allowFreeform: true,
    });
  });

  it("keeps plain prompts untouched", () => {
    const entries = inputRequestTranscriptEntries(event([{
      requestId: "call_2",
      prompt: "Is this correct?",
      options: [{ id: "confirm", label: "Confirm" }, { id: "edit", label: "Edit" }],
      allowFreeform: false,
    }]));

    expect(entries[0]!.text).toBe("Is this correct?");
    expect(entries[0]!.inputRequest?.prompt).toBe("Is this correct?");
  });

  it("treats an unwrapped confirmation request as confirm plus edit", async () => {
    const { isReportConfirmationRequest } = await import("../agent/lib/transcript.js");
    const entries = inputRequestTranscriptEntries(event([{
      requestId: "call_3",
      prompt: '{"prompt": "Confirm?"}',
      options: [{ id: "Confirm", label: "Confirm" }, { id: "Edit", label: "Edit" }],
    }]));
    expect(isReportConfirmationRequest(entries[0]!.inputRequest!)).toBe(true);
  });
});
