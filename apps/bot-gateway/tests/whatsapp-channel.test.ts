import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WAMessage, WASocket } from "baileys";
import { describe, expect, it, vi } from "vitest";
import {
  createWhatsAppTypingIndicator,
  FileMessageDedupe,
  SharedReportIngress,
  SimulatedReportStore,
  isWhatsAppStatusRequest,
  isWhatsAppFreshStartCommand,
  normalizeWhatsAppMessage,
  parseWhatsAppAllowedNumbers,
  resolveAllowedWhatsAppSender,
  whatsappUserContent,
  whatsappNumberedReviewAction,
  type EffiMediaStorage,
  type InboundMessage,
} from "../src/index.js";

const allowedNumbers = parseWhatsAppAllowedNumbers("+91 98765-43210");
const sender = {
  jid: "919876543210@s.whatsapp.net",
  phoneJid: "919876543210@s.whatsapp.net",
  phoneNumber: "919876543210",
};
const socket = {} as WASocket;
const message = (id: string, content: NonNullable<WAMessage["message"]>): WAMessage => ({
  key: { id, remoteJid: sender.jid, fromMe: false },
  message: content,
  messageTimestamp: 1_787_057_600,
});

describe("direct WhatsApp channel", () => {
  it("treats /reset and /clear as fresh-start commands", () => {
    expect(isWhatsAppFreshStartCommand(" /reset ")).toBe(true);
    expect(isWhatsAppFreshStartCommand("/CLEAR")).toBe(true);
    expect(isWhatsAppFreshStartCommand("clear")).toBe(false);
    expect(isWhatsAppFreshStartCommand("/reset this")).toBe(false);
  });

  it("keeps WhatsApp composing presence alive until processing stops", async () => {
    vi.useFakeTimers();
    try {
      const presence: string[] = [];
      const indicator = createWhatsAppTypingIndicator(async (state) => { presence.push(state); }, 8_000);

      await indicator.start();
      await vi.advanceTimersByTimeAsync(24_000);
      await indicator.stop();
      await vi.advanceTimersByTimeAsync(16_000);

      expect(presence).toEqual(["composing", "composing", "composing", "composing", "paused"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows only the configured phone number", async () => {
    const lookup = async (): Promise<string | null> => null;

    await expect(resolveAllowedWhatsAppSender({ jid: sender.jid, allowedNumbers, getPhoneJidForLid: lookup }))
      .resolves.toEqual(sender);
    await expect(resolveAllowedWhatsAppSender({
      jid: "919999999999@s.whatsapp.net",
      allowedNumbers,
      getPhoneJidForLid: lookup,
    })).resolves.toBeUndefined();
    await expect(resolveAllowedWhatsAppSender({
      jid: "120363000000000000@g.us",
      allowedNumbers,
      getPhoneJidForLid: lookup,
    })).resolves.toBeUndefined();
  });

  it("accepts an allowed sender represented by a mapped LID", async () => {
    const identity = await resolveAllowedWhatsAppSender({
      jid: "123456789012345@lid",
      allowedNumbers,
      getPhoneJidForLid: async () => sender.phoneJid,
    });

    expect(identity).toEqual({ ...sender, jid: "123456789012345@lid" });
  });

  it("normalizes a text message into the shared report contract", async () => {
    const normalized = await normalizeWhatsAppMessage({
      message: message("wamid.text-1", { conversation: "  A pothole blocks the road.  " }),
      socket,
      sender,
      mediaStorage: { async copy() { throw new Error("text messages have no media"); } },
    });

    expect(normalized?.inbound).toMatchObject({
      id: "whatsapp:wamid.text-1",
      providerEventId: "wamid.text-1",
      channel: "whatsapp",
      conversationId: sender.jid,
      senderId: sender.phoneJid,
      text: "A pothole blocks the road.",
    });
    expect(normalized && whatsappUserContent(normalized, normalized.inbound)).toBe("A pothole blocks the road.");
  });

  it("keeps a photo turn as structured content so the image reaches eve", async () => {
    const normalized = await normalizeWhatsAppMessage({
      message: message("wamid.image-2", { imageMessage: { mimetype: "image/jpeg", caption: "Evidence" } }),
      socket,
      sender,
      mediaStorage: {
        async copy() {
          return { storageKey: "effi/whatsapp/wamid_image-2-image-0.jpg" };
        },
      },
      downloadMedia: async () => Buffer.from("photo"),
    });

    expect(normalized && whatsappUserContent(normalized, normalized.inbound)).toEqual([
      { type: "text", text: "Evidence" },
      { type: "file", data: Buffer.from("photo"), mediaType: "image/jpeg", filename: "wamid_image-2-image-0" },
    ]);
  });

  it("copies image bytes before exposing them to Eve", async () => {
    const copies: string[] = [];
    const mediaStorage: EffiMediaStorage = {
      async copy(input) {
        copies.push(`${input.attachmentId}:${input.data.toString()}`);
        return { storageKey: `effi/whatsapp/${input.attachmentId}.jpg` };
      },
    };
    const normalized = await normalizeWhatsAppMessage({
      message: message("wamid.image-1", { imageMessage: { mimetype: "image/jpeg", caption: "Evidence" } }),
      socket,
      sender,
      mediaStorage,
      downloadMedia: async () => Buffer.from("photo"),
    });

    expect(copies).toEqual(["wamid_image-1-image-0:photo"]);
    expect(normalized?.inbound.attachments).toEqual([
      expect.objectContaining({
        id: "wamid_image-1-image-0",
        kind: "image",
        storageKey: "effi/whatsapp/wamid_image-1-image-0.jpg",
      }),
    ]);
  });

  it("stages a video, stores an observation, and keeps the turn as text", async () => {
    const observed: { mediaType: string; bytes: number }[] = [];
    const normalized = await normalizeWhatsAppMessage({
      message: message("wamid.video-1", { videoMessage: { mimetype: "video/mp4", caption: "Road damage" } }),
      socket,
      sender,
      mediaStorage: {
        async copy() {
          return { storageKey: "effi/whatsapp/wamid_video-1-video-0.mp4" };
        },
      },
      downloadMedia: async () => Buffer.from("video"),
      videoObservation: async (input) => {
        observed.push({ mediaType: input.mediaType, bytes: input.data.byteLength });
        return "A water-filled pothole covers the driving lane.";
      },
    });

    expect(observed).toEqual([{ mediaType: "video/mp4", bytes: 5 }]);
    expect(normalized?.inbound.attachments).toEqual([
      expect.objectContaining({
        id: "wamid_video-1-video-0",
        kind: "video",
        mediaType: "video/mp4",
        storageKey: "effi/whatsapp/wamid_video-1-video-0.mp4",
        observation: "A water-filled pothole covers the driving lane.",
      }),
    ]);
    expect(normalized && whatsappUserContent(normalized, normalized.inbound)).toBe("Road damage");
  });

  it("retains an exact WhatsApp pin without inventing coordinates", async () => {
    const normalized = await normalizeWhatsAppMessage({
      message: message("wamid.location-1", {
        locationMessage: { degreesLatitude: 19.076, degreesLongitude: 72.8777 },
      }),
      socket,
      sender,
      mediaStorage: { async copy() { throw new Error("location messages have no media"); } },
    });
    const invalid = await normalizeWhatsAppMessage({
      message: message("wamid.location-2", {
        locationMessage: { degreesLatitude: 91, degreesLongitude: 72.8777 },
      }),
      socket,
      sender,
      mediaStorage: { async copy() { throw new Error("location messages have no media"); } },
    });

    expect(normalized?.inbound.location).toEqual({
      source: "selected_pin",
      latitude: 19.076,
      longitude: 72.8777,
    });
    expect(invalid).toBeUndefined();
  });

  it("persists a numbered confirmation before resuming the blocked Eve turn", () => {
    const store = new SimulatedReportStore(() => "2026-09-10T11:00:00.000Z");
    const ingress = new SharedReportIngress(store);
    const initial: InboundMessage = {
      id: "whatsapp:issue-1",
      channel: "whatsapp",
      conversationId: sender.jid,
      senderId: sender.phoneJid,
      text: "A pothole blocks the road.",
      attachments: [{ id: "photo-1", kind: "image", mediaType: "image/jpeg", platformUrl: "whatsapp://photo-1" }],
      location: { source: "selected_pin", latitude: 19.076, longitude: 72.8777 },
      receivedAt: "2026-09-10T10:59:00.000Z",
    };
    const record = ingress.accept(initial);
    expect(record).toBeDefined();
    store.markAttachmentInspected("whatsapp", sender.jid, "photo-1");
    store.recordAttachmentQuality("whatsapp", sender.jid, "photo-1", "satisfactory");

    const action = whatsappNumberedReviewAction("1", true);
    expect(action).toBe("confirm");
    if (action !== "confirm") throw new Error("Expected the first review option to confirm.");
    const confirmation: InboundMessage = {
      id: "whatsapp:confirm-1",
      channel: "whatsapp",
      conversationId: sender.jid,
      senderId: sender.phoneJid,
      text: "1",
      action,
      receivedAt: "2026-09-10T11:00:00.000Z",
    };
    ingress.accept(confirmation);

    expect(store.prepareSubmission({
      channel: "whatsapp",
      conversationId: sender.jid,
      issue: "A pothole blocks the road.",
      category: "roads",
      acceptedAttachmentIds: ["photo-1"],
      receivedAt: confirmation.receivedAt,
    }).authenticationLink).toBe("simulated-auth://pending_1");
  });

  it("maps numbered review replies only when a complete report is ready", () => {
    expect(whatsappNumberedReviewAction("1", true)).toBe("confirm");
    expect(whatsappNumberedReviewAction("2", true)).toBe("edit");
    expect(whatsappNumberedReviewAction("1", false)).toBeUndefined();
  });

  it("deduplicates provider IDs across restarts and releases failed claims", async () => {
    const directory = await mkdtemp(join(tmpdir(), "effi-whatsapp-dedupe-"));
    const filePath = join(directory, "message-ids.json");
    try {
      expect(await new FileMessageDedupe(filePath).claim("wamid.duplicate-1")).toBe(true);
      expect(await new FileMessageDedupe(filePath).claim("wamid.duplicate-1")).toBe(false);
      await new FileMessageDedupe(filePath).release("wamid.duplicate-1");
      expect(await new FileMessageDedupe(filePath).claim("wamid.duplicate-1")).toBe(true);
      await new FileMessageDedupe(filePath).complete("wamid.duplicate-1");
      expect(await new FileMessageDedupe(filePath).claim("wamid.duplicate-1")).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps case-status requests outside the registration agent", () => {
    expect(isWhatsAppStatusRequest("What is the status of my complaint?")).toBe(true);
    expect(isWhatsAppStatusRequest("How do I report a pothole?")).toBe(false);
  });
});
