import { describe, expect, it } from "vitest";
import { nextCaseStatus, transitionCase } from "../src/index.js";

describe("transitionCase", () => {
  it("records allowed transitions", () => expect(transitionCase("new", "assigned", "2026-08-18T00:00:00.000Z").to).toBe("assigned"));
  it("rejects invalid transitions", () => expect(() => transitionCase("new", "resolved", "2026-08-18T00:00:00.000Z")).toThrow("Invalid case status transition"));
  it("returns the next status and stops at resolved", () => {
    expect(nextCaseStatus("assigned")).toBe("under_inspection");
    expect(nextCaseStatus("work_in_progress")).toBe("awaiting_confirmation");
    expect(nextCaseStatus("awaiting_confirmation")).toBe("resolved");
    expect(nextCaseStatus("disputed")).toBe("work_in_progress");
    expect(nextCaseStatus("resolved")).toBeNull();
  });
  it("allows citizen confirmation and dispute transitions", () => {
    expect(transitionCase("awaiting_confirmation", "resolved", "2026-08-18T00:00:00.000Z").to).toBe("resolved");
    expect(transitionCase("awaiting_confirmation", "disputed", "2026-08-18T00:00:00.000Z").to).toBe("disputed");
    expect(transitionCase("disputed", "work_in_progress", "2026-08-18T00:00:00.000Z").to).toBe("work_in_progress");
    expect(transitionCase("disputed", "under_inspection", "2026-08-18T00:00:00.000Z").to).toBe("under_inspection");
    expect(transitionCase("disputed", "resolved", "2026-08-18T00:00:00.000Z").to).toBe("resolved");
  });
});
