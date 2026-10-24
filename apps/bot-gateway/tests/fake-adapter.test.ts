import { describe, expect, it } from "vitest";
import {
  authenticationLinkLifetimeMs,
  FakeChannelAdapter,
  FakeVisionReportModel,
  SimulatedReportRegistration,
  SimulatedReportStore,
  type InboundAttachment,
  type InboundMessage,
  type PhotoQuality,
} from "../src/index.js";

let messageCount = 0;
const storeAt = (time = "2026-08-18T12:01:00.000Z") => new SimulatedReportStore(() => time);
const message = (overrides: Partial<InboundMessage>): InboundMessage => ({
  id: `message_${++messageCount}`,
  channel: "telegram",
  conversationId: "conversation_1",
  senderId: "telegram_citizen_1",
  receivedAt: "2026-08-18T12:00:00.000Z",
  ...overrides,
});
const photo = (id: string, quality: PhotoQuality, overrides: Partial<InboundAttachment> = {}): InboundAttachment => ({
  id,
  kind: "image",
  mediaType: "image/jpeg",
  platformUrl: `https://platform.example/${id}.jpg`,
  quality,
  ...overrides,
});

describe("FakeChannelAdapter", () => {
  it("records outbound messages", async () => {
    const adapter = new FakeChannelAdapter();
    await adapter.send({ channel: "telegram", conversationId: "conversation_1", text: "Hello" });
    expect(adapter.sent).toHaveLength(1);
  });

  it("drops a malformed inbound envelope before persistence or model processing", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    const registration = new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await registration.receive({
      id: "malformed_message",
      channel: "telegram",
      conversationId: "conversation_1",
      senderId: "telegram_citizen_1",
      location: { source: "current_gps", latitude: "not-a-number", longitude: 72.8777 },
      receivedAt: "2026-08-18T12:00:00.000Z",
    });

    expect(store.activeConversation("telegram", "conversation_1")).toBeUndefined();
    expect(adapter.sent).toHaveLength(0);
  });

  it("completes one authenticated report through the shared inbound contract", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    const registration = new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver(message({ text: "There is a large pothole outside the library." }));
    await adapter.deliver(message({ attachments: [{ id: "platform_photo_1", kind: "image", mediaType: "image/jpeg", platformUrl: "https://platform.example/photo.jpg", quality: "satisfactory" }] }));
    await adapter.deliver(message({ location: { source: "current_gps", latitude: 19.076, longitude: 72.8777 } }));

    expect(adapter.sent.at(-1)?.text).toContain("Review your report");

    await adapter.deliver(message({ text: "The issue is a pothole by the library entrance." }));
    expect(adapter.sent.at(-1)?.text).toContain("Review your report");

    await adapter.deliver(message({ text: "confirm" }));
    const authenticationLink = adapter.sent.at(-1)?.authenticationLink;
    expect(authenticationLink).toMatch(/^simulated-auth:\/\//);

    const firstResult = await registration.completeAuthentication({ authenticationLink: authenticationLink!, citizenId: "citizen_42" });
    const repeatedResult = await registration.completeAuthentication({ authenticationLink: authenticationLink!, citizenId: "citizen_42" });

    expect(firstResult.report.id).toEqual(repeatedResult.report.id);
    expect(adapter.sent.at(-1)?.text).toContain(firstResult.report.id);
    expect(store.reports()).toHaveLength(1);
    expect(adapter.sent.filter((outbound) => outbound.text.includes("Report ID:"))).toHaveLength(1);
    await expect(registration.completeAuthentication({ authenticationLink: authenticationLink!, citizenId: "citizen_99" })).rejects.toThrow("already been used");

    const persisted = store.report(firstResult.report.id)!;
    expect(persisted.citizenId).toBe("citizen_42");
    expect(persisted.location).toEqual({ source: "current_gps", latitude: 19.076, longitude: 72.8777 });
    expect(persisted.primaryEvidence).toEqual([expect.objectContaining({ attachmentId: "platform_photo_1", storageKey: expect.stringMatching(/^effi\//) })]);
    expect(persisted.conversation.messages).toHaveLength(5);
    expect(persisted.conversation.messages[1]?.attachments[0]?.storageKey).toMatch(/^effi\//);

    await adapter.deliver(message({ text: "A streetlight is broken near the park." }));
    const resumed = store.activeConversation("telegram", "conversation_1")!;
    expect(resumed.sessionId).not.toBe(persisted.conversation.sessionId);
    expect(resumed.messages.at(-1)?.text).toContain("streetlight");
  });

  it("coalesces a same-turn text, photo, and location burst after persisting every message", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await Promise.all([
      adapter.deliver(message({ id: "burst-text", text: "A pothole blocks the road." })),
      adapter.deliver(message({
        id: "burst-photo",
        attachments: [photo("burst-photo-evidence", "satisfactory")],
      })),
      adapter.deliver(message({
        id: "burst-location",
        location: { source: "current_gps", latitude: 19.076, longitude: 72.8777 },
      })),
    ]);

    const conversation = store.activeConversation("telegram", "conversation_1");
    expect(conversation?.messages.map(({ id }) => id)).toEqual(["burst-text", "burst-photo", "burst-location"]);
    expect(adapter.sent).toHaveLength(1);
    expect(adapter.sent[0]?.text).toContain("Review your report");
    expect(adapter.sent[0]?.interpretation).toMatchObject({
      issue: "A pothole blocks the road.",
      location: { latitude: 19.076, longitude: 72.8777 },
      primaryEvidence: [{ id: "burst-photo-evidence" }],
    });
  });

  it("keeps concurrent citizens isolated while steering each conversation independently", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await Promise.all([
      adapter.deliver(message({ id: "citizen-a", conversationId: "conversation_a", senderId: "citizen_a", text: "A pothole blocks the road." })),
      adapter.deliver(message({ id: "citizen-b", conversationId: "conversation_b", senderId: "citizen_b", text: "The streetlight is broken." })),
    ]);

    expect(store.activeConversation("telegram", "conversation_a")?.issue).toBe("A pothole blocks the road.");
    expect(store.activeConversation("telegram", "conversation_b")?.issue).toBe("The streetlight is broken.");
    expect(store.activeConversation("telegram", "conversation_a")?.sessionId).not.toBe(
      store.activeConversation("telegram", "conversation_b")?.sessionId,
    );
  });

  it("keeps authentication links valid for 24 hours and rejects them at expiry", async () => {
    const adapter = new FakeChannelAdapter();
    let now = "2026-08-18T12:00:00.000Z";
    const store = new SimulatedReportStore(() => now);
    const registration = new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver(message({ text: "A pothole blocks the road." }));
    await adapter.deliver(message({ attachments: [{ id: "photo_3", kind: "image", mediaType: "image/jpeg", platformUrl: "https://platform.example/photo_3.jpg", quality: "satisfactory" }] }));
    await adapter.deliver(message({ location: { source: "current_gps", latitude: 19.076, longitude: 72.8777 } }));
    await adapter.deliver(message({ text: "confirm" }));
    const expiredLink = adapter.sent.at(-1)?.authenticationLink;
    if (!expiredLink) throw new Error("Expected simulated authentication link.");

    const pending = store.pendingSubmission(expiredLink);
    expect(Date.parse(pending!.expiresAt) - Date.parse("2026-08-18T12:00:00.000Z")).toBe(authenticationLinkLifetimeMs);

    now = "2026-08-19T11:59:59.999Z";
    expect(store.pendingSubmission(expiredLink)).toBeDefined();

    now = "2026-08-19T12:00:00.000Z";
    await expect(registration.completeAuthentication({ authenticationLink: expiredLink, citizenId: "citizen_42" })).rejects.toThrow("expired");
  });

  it("keeps an insufficient image in the conversation without accepting it as primary evidence", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver(message({ text: "The drain has overflowed." }));
    await adapter.deliver(message({ attachments: [{ id: "blurred_photo", kind: "image", mediaType: "image/jpeg", platformUrl: "https://platform.example/blurred.jpg", quality: "insufficient" }] }));

    expect(adapter.sent.at(-1)?.text).toContain("clearer photo");
    const conversation = store.activeConversation("telegram", "conversation_1")!;
    expect(conversation.messages[1]?.attachments[0]?.storageKey).toMatch(/^effi\//);
    expect(conversation.acceptedEvidence).toEqual([]);
  });

  it("distinguishes undecodable, unrelated, and uncertain photos while retaining each original", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver(message({ text: "The drain has overflowed." }));
    await adapter.deliver(message({ attachments: [photo("unreadable_photo", "undecodable", { decodable: false })] }));
    expect(adapter.sent.at(-1)?.text).toContain("couldn't read");
    await adapter.deliver(message({ attachments: [photo("wrong_photo", "unrelated")] }));
    expect(adapter.sent.at(-1)?.text).toContain("doesn't clearly show");
    await adapter.deliver(message({ attachments: [photo("uncertain_photo", "uncertain")] }));
    expect(adapter.sent.at(-1)?.text).toContain("can't tell enough");

    const conversation = store.activeConversation("telegram", "conversation_1")!;
    expect(conversation.messages.flatMap((saved) => saved.attachments).map((attachment) => attachment.id)).toEqual([
      "unreadable_photo",
      "wrong_photo",
      "uncertain_photo",
    ]);
    expect(conversation.acceptedEvidence).toEqual([]);

    await adapter.deliver(message({ attachments: [photo("accepted_photo", "satisfactory")] }));
    await adapter.deliver(message({ location: { source: "current_gps", latitude: 19.076, longitude: 72.8777 } }));
    expect(adapter.sent.at(-1)?.text).toContain("Review your report");
    expect(conversation.acceptedEvidence.map((attachment) => attachment.id)).toEqual(["accepted_photo"]);
  });

  it("supports edit actions, focused photo replacement, and confirm actions", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    const registration = new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver(message({ text: "The streetlight is broken." }));
    await adapter.deliver(message({ attachments: [photo("photo_before_edit", "satisfactory")] }));
    await adapter.deliver(message({ location: { source: "selected_pin", latitude: 28.6139, longitude: 77.209 } }));
    expect(adapter.sent.at(-1)?.actions).toEqual(["confirm", "edit"]);

    await adapter.deliver(message({ action: "edit" }));
    expect(adapter.sent.at(-1)?.text.toLowerCase()).toContain("which detail");
    await adapter.deliver(message({ text: "photo" }));
    expect(adapter.sent.at(-1)?.text).toContain("replacement photo");
    await adapter.deliver(message({ attachments: [photo("photo_after_edit", "satisfactory")] }));
    expect(adapter.sent.at(-1)?.text).toContain("photo_after_edit");
    expect(adapter.sent.at(-1)?.interpretation?.primaryEvidence.map((attachment) => attachment.id)).toEqual(["photo_after_edit"]);

    await adapter.deliver(message({ action: "confirm" }));
    const authenticationLink = adapter.sent.at(-1)?.authenticationLink;
    expect(authenticationLink).toMatch(/^simulated-auth:\/\//);
    expect(store.reports()).toHaveLength(0);
    await registration.completeAuthentication({ authenticationLink: authenticationLink!, citizenId: "citizen_42" });
  });

  it("allows help and cancellation without imposing a photo retry limit", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver(message({ text: "The drain has overflowed." }));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await adapter.deliver(message({ attachments: [photo(`bad_photo_${attempt}`, "uncertain")] }));
    }
    await adapter.deliver(message({ action: "help" }));
    expect(adapter.sent.at(-1)?.text).toContain("clear photo");
    await adapter.deliver(message({ action: "cancel" }));
    expect(adapter.sent.at(-1)?.text).toContain("cancelled");

    await adapter.deliver(message({ text: "A new pothole blocks the road." }));
    expect(store.activeConversation("telegram", "conversation_1")?.issue).toBe("A new pothole blocks the road.");
    expect(store.activeConversation("telegram", "conversation_1")?.messages).toHaveLength(1);
  });

  it("keeps a pending submission locked even when the citizen asks to cancel", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    const registration = new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver(message({ text: "The streetlight is broken." }));
    await adapter.deliver(message({ attachments: [photo("voice_photo", "satisfactory")] }));
    await adapter.deliver(message({ location: { source: "current_gps", latitude: 19.076, longitude: 72.8777 } }));
    await adapter.deliver(message({ voiceTranscript: "The streetlight is broken near the school gate." }));
    expect(adapter.sent.at(-1)?.interpretation?.issue).toBe("The streetlight is broken near the school gate.");

    await adapter.deliver(message({ voiceTranscript: "confirm" }));
    const authenticationLink = adapter.sent.at(-1)?.authenticationLink;
    if (!authenticationLink) throw new Error("Expected simulated authentication link.");
    await adapter.deliver(message({ voiceTranscript: "cancel" }));

    expect(adapter.sent.at(-1)?.text).toContain("Complete the authentication link");
    expect(store.reports()).toHaveLength(0);
    await expect(registration.completeAuthentication({ authenticationLink, citizenId: "citizen_42" })).resolves.toBeDefined();
  });

  it("freezes the reviewed interpretation once confirmation is explicit", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    const registration = new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver(message({ text: "The streetlight is broken." }));
    await adapter.deliver(message({ attachments: [photo("frozen_photo", "satisfactory")] }));
    await adapter.deliver(message({ location: { source: "current_gps", latitude: 19.076, longitude: 72.8777 } }));
    await adapter.deliver(message({ text: "confirm" }));
    const authenticationLink = adapter.sent.at(-1)?.authenticationLink;
    if (!authenticationLink) throw new Error("Expected simulated authentication link.");

    await adapter.deliver(message({ text: "Change the issue to a broken water pipe." }));
    expect(adapter.sent.at(-1)?.text.toLowerCase()).toContain("complete the authentication link");
    expect(store.activeConversation("telegram", "conversation_1")?.messages.at(-1)?.text).toBe("confirm");
    const { report } = await registration.completeAuthentication({ authenticationLink, citizenId: "citizen_42" });
    expect(report.interpretation.issue).toBe("The streetlight is broken.");
    expect(report.conversation.messages.at(-1)?.text).toBe("confirm");
  });

  it("accepts a manually selected pin through the same shared contract", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver(message({ text: "The streetlight is broken." }));
    await adapter.deliver(message({ attachments: [{ id: "photo_2", kind: "image", mediaType: "image/jpeg", platformUrl: "https://platform.example/photo_2.jpg", quality: "satisfactory" }] }));
    await adapter.deliver(message({ location: { source: "selected_pin", latitude: 28.6139, longitude: 77.209 } }));

    expect(adapter.sent.at(-1)?.interpretation?.location).toEqual({ source: "selected_pin", latitude: 28.6139, longitude: 77.209 });

    await adapter.deliver(message({ text: "The photo is wrong." }));
    expect(adapter.sent.at(-1)?.text).toContain("replacement photo");
    expect(store.activeConversation("telegram", "conversation_1")?.issue).toBe("The streetlight is broken.");

    await adapter.deliver(message({ attachments: [{ id: "photo_4", kind: "image", mediaType: "image/jpeg", platformUrl: "https://platform.example/photo_4.jpg", quality: "satisfactory" }] }));
    expect(adapter.sent.at(-1)?.text).toContain("photo_4");
  });

  it("keeps a registered WhatsApp conversation stable when a provider event is redelivered", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    const registration = new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });
    const whatsappMessage = (overrides: Partial<InboundMessage>): InboundMessage => message({
      channel: "whatsapp",
      conversationId: "15551234567@s.whatsapp.net",
      senderId: "15551234567@s.whatsapp.net",
      ...overrides,
    });

    await adapter.deliver(whatsappMessage({ id: "wa_issue", text: "A pothole blocks the road." }));
    await adapter.deliver(whatsappMessage({ id: "wa_photo", attachments: [{ id: "wa_photo_1", kind: "image", mediaType: "image/jpeg", platformUrl: "whatsapp://media/1", quality: "satisfactory" }] }));
    await adapter.deliver(whatsappMessage({ id: "wa_location", location: { source: "current_gps", latitude: 19.076, longitude: 72.8777 } }));
    await adapter.deliver(whatsappMessage({ id: "wa_correction", text: "The pothole is directly outside the library entrance." }));
    await adapter.deliver(whatsappMessage({ id: "wa_confirm", text: "confirm" }));

    const authenticationLink = adapter.sent.at(-1)?.authenticationLink;
    if (!authenticationLink) throw new Error("Expected WhatsApp authentication link.");
    const { report } = await registration.completeAuthentication({ authenticationLink, citizenId: "citizen_wa_1" });
    expect(adapter.sent.at(-1)?.text).toContain(report.id);
    expect(report.interpretation.issue).toContain("directly outside the library entrance");

    await adapter.deliver(whatsappMessage({ id: "wa_issue", text: "A different issue must not replace this conversation." }));

    expect(store.reports()).toHaveLength(1);
    expect(report.conversation.channel).toBe("whatsapp");
    expect(store.activeConversation("whatsapp", "15551234567@s.whatsapp.net")?.phase).toBe("registered");
    expect(store.activeConversation("whatsapp", "15551234567@s.whatsapp.net")?.messages).toHaveLength(5);
  });

  it("does not expose report status through a WhatsApp text query", async () => {
    const adapter = new FakeChannelAdapter();
    const store = storeAt();
    new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    await adapter.deliver({
      id: "wa_status",
      channel: "whatsapp",
      conversationId: "15551234567@s.whatsapp.net",
      senderId: "15551234567@s.whatsapp.net",
      text: "What is the status of my case?",
      receivedAt: "2026-08-18T12:00:00.000Z",
    });

    expect(adapter.sent.at(-1)?.text).toBe("Please send a clear photo of the issue.");
    expect(adapter.sent.at(-1)?.text).not.toMatch(/report id|case status|progress/i);
  });
});
