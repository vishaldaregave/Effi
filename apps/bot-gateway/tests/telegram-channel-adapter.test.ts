import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTelegramUpdate } from "eve/channels/telegram";
import { TelegramReportIngress } from "../agent/lib/telegram-reporting.js";
import {
  FakeVisionReportModel,
  FileMessageDedupe,
  MemoryEvidenceStorage,
  SimulatedReportRegistration,
  SimulatedReportStore,
  TelegramChannelAdapter,
  type InboundMessage,
} from "../src/index.js";

const secret = "telegram-webhook-secret";
const now = () => new Date("2026-08-18T12:00:00.000Z");

const telegramUpdate = (update: Record<string, unknown>, updateId: number) =>
  JSON.stringify({ update_id: updateId, ...update });

const message = (overrides: Record<string, unknown> = {}) => ({
  message_id: 1,
  date: 1_787_054_400,
  chat: { id: 42, type: "private" },
  from: { id: 7, is_bot: false, first_name: "Citizen" },
  ...overrides,
});

const apiFetch = () => {
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    calls.push({ url, ...(body ? { body } : {}) });

    if (url.endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "photos/issue.jpg" } });
    if (url.includes("/file/bot")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    if (url.endsWith("/sendMessage")) {
      return Response.json({ ok: true, result: { message_id: calls.length, chat: { id: 42, type: "private" } } });
    }
    throw new Error(`Unexpected Telegram API call: ${url}`);
  });

  return { calls, fetch };
};

const adapterFor = (fetch: typeof globalThis.fetch, storage = new MemoryEvidenceStorage()) =>
  new TelegramChannelAdapter({
    botToken: "bot-token",
    webhookSecretToken: secret,
    apiBaseUrl: "https://telegram.test",
    fileBaseUrl: "https://telegram.test/file",
    fetch,
    now,
    storage,
  });

describe("TelegramChannelAdapter", () => {
  it("rejects invalid webhook secrets before parsing the provider body", async () => {
    const { fetch } = apiFetch();
    const adapter = adapterFor(fetch);
    const request = { signature: "wrong", timestamp: null, rawBody: telegramUpdate({ message: message({ text: "hello" }) }, 1) };

    await expect(adapter.deliverWebhook(request)).resolves.toBe(false);
    expect(adapter.received).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes text, staged images, exact locations, and ignores a redelivered update", async () => {
    const { fetch } = apiFetch();
    const storage = new MemoryEvidenceStorage();
    const adapter = adapterFor(fetch, storage);
    const received: InboundMessage[] = [];
    adapter.registerInboundHandler(async (inbound) => {
      received.push(inbound);
    });

    const body = telegramUpdate(
      {
        message: message({
          message_id: 9,
          text: "There is a pothole outside the library.",
          photo: [{ file_id: "photo-small", width: 320, height: 240 }, { file_id: "photo-large", width: 1280, height: 960 }],
          location: { latitude: 19.076, longitude: 72.8777, live_period: 900 },
        }),
      },
      22,
    );

    await expect(adapter.deliverWebhook({ signature: secret, timestamp: null, rawBody: body })).resolves.toBe(true);
    await expect(adapter.deliverWebhook({ signature: secret, timestamp: null, rawBody: body })).resolves.toBe(true);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      id: "telegram:42:9",
      channel: "telegram",
      conversationId: "42",
      senderId: "7",
      text: "There is a pothole outside the library.",
      location: { source: "current_gps", latitude: 19.076, longitude: 72.8777 },
    });
    expect(received[0]?.attachments?.[0]).toMatchObject({
      id: "photo-large",
      platformUrl: "telegram-file:photo-large",
      storageKey: "effi/telegram/42/9/photo-large",
    });
    await expect(storage.read("effi/telegram/42/9/photo-large")).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/getFile"))).toHaveLength(1);
  });

  it("stages Telegram voice notes from the raw voice object retained by Eve", async () => {
    const { fetch } = apiFetch();
    const storage = new MemoryEvidenceStorage();
    const adapter = adapterFor(fetch, storage);
    const received: InboundMessage[] = [];
    adapter.registerInboundHandler(async (inbound) => {
      received.push(inbound);
    });

    await adapter.deliverWebhook({
      signature: secret,
      timestamp: null,
      rawBody: telegramUpdate({
        message: message({
          message_id: 12,
          voice: { file_id: "voice-12", file_unique_id: "unique-12", duration: 3, mime_type: "audio/ogg", file_size: 3 },
        }),
      }, 25),
    });

    expect(received[0]).toMatchObject({
      id: "telegram:42:12",
      attachments: [{
        id: "voice-12",
        kind: "audio",
        mediaType: "audio/ogg",
        storageKey: "effi/telegram/42/12/voice-12.audio",
      }],
    });
    await expect(storage.read("effi/telegram/42/12/voice-12.audio")).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("stages Telegram videos from the raw video object and records an observation", async () => {
    const { fetch } = apiFetch();
    const storage = new MemoryEvidenceStorage();
    const observed: { mediaType: string; bytes: number }[] = [];
    const adapter = new TelegramChannelAdapter({
      botToken: "bot-token",
      webhookSecretToken: secret,
      apiBaseUrl: "https://telegram.test",
      fileBaseUrl: "https://telegram.test/file",
      fetch,
      now,
      storage,
      videoObservation: async (input) => {
        observed.push({ mediaType: input.mediaType, bytes: input.data.byteLength });
        return "A muddy pothole fills the lane as two riders cross it.";
      },
    });
    const received: InboundMessage[] = [];
    adapter.registerInboundHandler(async (inbound) => {
      received.push(inbound);
    });

    await adapter.deliverWebhook({
      signature: secret,
      timestamp: null,
      rawBody: telegramUpdate({
        message: message({
          message_id: 13,
          video: { file_id: "video-13", file_unique_id: "unique-13", duration: 5, mime_type: "video/mp4", file_size: 3 },
        }),
      }, 26),
    });

    expect(received[0]).toMatchObject({
      id: "telegram:42:13",
      attachments: [{
        id: "video-13",
        kind: "video",
        mediaType: "video/mp4",
        storageKey: "effi/telegram/42/13/video-13.video",
        observation: "A muddy pothole fills the lane as two riders cross it.",
      }],
    });
    expect(observed).toEqual([{ mediaType: "video/mp4", bytes: 3 }]);
    await expect(storage.read("effi/telegram/42/13/video-13.video")).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("keeps Telegram provider-message dedupe durable across ingress instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "effi-telegram-ingress-"));
    try {
      const parsed = parseTelegramUpdate({ message: message({ message_id: 70, text: "A pothole blocks the road." }) });
      if (!parsed || parsed.kind !== "message") throw new Error("Expected a Telegram message update.");
      const filePath = join(directory, "message-ids.json");
      const first = new TelegramReportIngress({
        adapter: adapterFor(apiFetch().fetch),
        store: new SimulatedReportStore(),
        messageDedupe: new FileMessageDedupe(filePath),
      });
      await expect(first.accept(parsed.message)).resolves.toBeDefined();

      const second = new TelegramReportIngress({
        adapter: adapterFor(apiFetch().fetch),
        store: new SimulatedReportStore(),
        messageDedupe: new FileMessageDedupe(filePath),
      });
      await expect(second.accept(parsed.message)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("ignores malformed JSON and out-of-range coordinates at the webhook boundary", async () => {
    const { fetch } = apiFetch();
    const adapter = adapterFor(fetch);
    const received: InboundMessage[] = [];
    adapter.registerInboundHandler(async (inbound) => {
      received.push(inbound);
    });

    await expect(adapter.deliverWebhook({ signature: secret, timestamp: null, rawBody: "not-json" })).resolves.toBe(true);
    await adapter.deliverWebhook({
      signature: secret,
      timestamp: null,
      rawBody: telegramUpdate({ message: message({ location: { latitude: 91, longitude: 72.8777 } }) }, 26),
    });

    expect(received[0]?.location).toBeUndefined();
  });

  it("normalizes confirmation callbacks and preserves forum-topic delivery targets", async () => {
    const { calls, fetch } = apiFetch();
    const adapter = adapterFor(fetch);
    const received: InboundMessage[] = [];
    adapter.registerInboundHandler(async (inbound) => {
      received.push(inbound);
    });

    await adapter.deliverWebhook({
      signature: secret,
      timestamp: null,
      rawBody: telegramUpdate(
        {
          callback_query: {
            id: "callback-1",
            from: { id: 7, is_bot: false },
            data: "effi:confirm",
            message: { message_id: 99, message_thread_id: 77, chat: { id: 42, type: "supergroup" } },
          },
        },
        27,
      ),
    });
    await adapter.send({ channel: "telegram", conversationId: "42:77", text: "Thread reply" });

    expect(received[0]).toMatchObject({
      id: "telegram:callback:callback-1",
      action: "confirm",
      conversationId: "42:77",
    });
    expect(calls.find((call) => call.url.endsWith("/sendMessage"))?.body).toMatchObject({
      chat_id: "42",
      message_thread_id: 77,
    });
  });

  it("keeps typed addresses incomplete and recognizes a selected map pin", async () => {
    const { fetch } = apiFetch();
    const adapter = adapterFor(fetch);
    const received: InboundMessage[] = [];
    adapter.registerInboundHandler(async (inbound) => {
      received.push(inbound);
    });

    await adapter.deliverWebhook({
      signature: secret,
      timestamp: null,
      rawBody: telegramUpdate({ message: message({ message_id: 10, text: "Near the central market" }) }, 23),
    });
    await adapter.deliverWebhook({
      signature: secret,
      timestamp: null,
      rawBody: telegramUpdate(
        { message: message({ message_id: 11, location: { latitude: 28.6139, longitude: 77.209, effi_source: "selected_pin" } }) },
        24,
      ),
    });

    expect(received[0]?.location).toBeUndefined();
    expect(received[1]?.location).toEqual({ source: "selected_pin", latitude: 28.6139, longitude: 77.209 });
  });

  it("sends review actions and authentication links as Telegram inline buttons", async () => {
    const { calls, fetch } = apiFetch();
    const adapter = adapterFor(fetch);

    await adapter.send({
      channel: "telegram",
      conversationId: "42",
      text: "Review your report.",
      actions: [
        { id: "confirm", label: "Confirm" },
        { id: "edit", label: "Edit" },
      ],
      authenticationLink: "https://auth.example.test/telegram/token",
    });

    const sendCall = calls.find((call) => call.url.endsWith("/sendMessage"));
    expect(sendCall?.body).toMatchObject({
      chat_id: "42",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Confirm", callback_data: "effi:confirm" },
            { text: "Edit", callback_data: "effi:edit" },
          ],
          [{ text: "Authenticate", url: "https://auth.example.test/telegram/token" }],
        ],
      },
    });
  });

  it("requires inspected and explicitly accepted staged evidence before submission", () => {
    const store = new SimulatedReportStore(() => now().toISOString(), { tokenFactory: () => "submission-token" });
    const inbound: InboundMessage = {
      id: "telegram:42:40",
      channel: "telegram",
      conversationId: "42",
      senderId: "7",
      text: "A pothole blocks the road.",
      attachments: [{ id: "photo-40", kind: "image", mediaType: "image/jpeg", platformUrl: "telegram-file:photo-40" }],
      location: { source: "current_gps", latitude: 19.076, longitude: 72.8777 },
      receivedAt: now().toISOString(),
    };
    const issue = "A pothole blocks the road.";
    const location = { source: "current_gps" as const, latitude: 19.076, longitude: 72.8777 };
    const conversation = store.startConversation(inbound);
    store.persistInbound(conversation, inbound);
    conversation.issue = issue;
    conversation.location = location;
    conversation.phase = "awaiting_confirmation";

    const submission = {
      channel: "telegram" as const,
      conversationId: "42",
      issue,
      category: "roads" as const,
      acceptedAttachmentIds: ["photo-40"],
      receivedAt: inbound.receivedAt,
    };
    expect(() => store.prepareSubmission(submission)).toThrow("inspected");
    store.markAttachmentInspected("telegram", "42", "photo-40");
    expect(() => store.prepareSubmission(submission)).toThrow("explicitly accepted");
    store.recordAttachmentQuality("telegram", "42", "photo-40", "satisfactory");

    expect(store.prepareSubmission(submission).authenticationLink).toBe("simulated-auth://pending_1");
  });

  it("runs the shared authenticated registration path and binds authentication to Telegram", async () => {
    const { fetch } = apiFetch();
    const storage = new MemoryEvidenceStorage();
    const adapter = adapterFor(fetch, storage);
    const store = new SimulatedReportStore(() => now().toISOString(), {
      authenticationBaseUrl: "https://auth.example.test/telegram",
      tokenFactory: () => "one-time-token",
    });
    const registration = new SimulatedReportRegistration({ adapter, store, model: new FakeVisionReportModel() });

    const send = async (updateId: number, update: Record<string, unknown>) =>
      adapter.deliverWebhook({ signature: secret, timestamp: null, rawBody: telegramUpdate(update, updateId) });

    await send(30, { message: message({ message_id: 20, text: "A large pothole blocks the road." }) });
    await send(31, {
      message: message({
        message_id: 21,
        photo: [{ file_id: "accepted-photo", width: 1280, height: 960 }],
      }),
    });
    store.markAttachmentInspected("telegram", "42", "accepted-photo");
    store.recordAttachmentQuality("telegram", "42", "accepted-photo", "satisfactory");
    await send(32, { message: message({ message_id: 22, location: { latitude: 19.076, longitude: 72.8777, live_period: 900 } }) });
    await send(33, { message: message({ message_id: 23, text: "confirm" }) });

    const authenticationLink = adapter.sent.at(-1)?.authenticationLink;
    expect(authenticationLink).toBe("https://auth.example.test/telegram/one-time-token");

    const first = await registration.completeAuthentication({
      authenticationLink: authenticationLink!,
      citizenId: "citizen_42",
      channel: "telegram",
      conversationId: "42",
    });
    const repeated = await registration.completeAuthentication({
      authenticationLink: authenticationLink!,
      citizenId: "citizen_42",
      channel: "telegram",
      conversationId: "42",
    });

    expect(first.report.id).toBe(repeated.report.id);
    expect(store.reports()).toHaveLength(1);
    expect(first.report.primaryEvidence).toEqual([expect.objectContaining({ attachmentId: "accepted-photo", storageKey: "effi/telegram/42/21/accepted-photo" })]);
    expect(first.report.location).toEqual({ source: "current_gps", latitude: 19.076, longitude: 72.8777 });
    expect(adapter.sent.filter((outbound) => outbound.text.includes("Report ID:")).length).toBe(1);
    await expect(
      registration.completeAuthentication({
        authenticationLink: authenticationLink!,
        citizenId: "citizen_42",
        channel: "telegram",
        conversationId: "different-chat",
      }),
    ).rejects.toThrow("bound to the original Telegram conversation");
  });
});
