import { Message, type Lock, type QueueEntry, type SerializedMessage, type StateAdapter } from "chat";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AtomicFileWriter } from "./atomic-file-writer.js";

type CacheEntry = { value: unknown; expiresAt: number | null };
type PersistedState = {
  subscriptions: string[];
  cache: Record<string, CacheEntry>;
  queues: Record<string, QueueEntry[]>;
};

type RawObject = Record<string, unknown>;
const asRecord = (value: unknown): RawObject | undefined => (
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as RawObject : undefined
);

const parseCacheEntry = (value: unknown): CacheEntry | undefined => {
  const entry = asRecord(value);
  const expiresAt = entry?.expiresAt;
  if (!entry || (expiresAt !== null && typeof expiresAt !== "number")) return undefined;
  return { value: entry.value, expiresAt };
};

const finiteNumber = z.number().finite();
const validDate = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const serializedAttachment = z.object({
  type: z.enum(["image", "file", "video", "audio"]),
  url: z.string().optional(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
  size: finiteNumber.nonnegative().optional(),
  width: finiteNumber.nonnegative().optional(),
  height: finiteNumber.nonnegative().optional(),
  fetchMetadata: z.record(z.string(), z.string()).optional(),
});
const serializedAuthor = z.object({
  userId: z.string(),
  userName: z.string(),
  fullName: z.string(),
  email: z.string().optional(),
  isBot: z.union([z.boolean(), z.literal("unknown")]),
  isMe: z.boolean(),
  isSystem: z.boolean().optional(),
});
const formattedRoot = z.object({ type: z.literal("root"), children: z.array(z.unknown()) }).passthrough();
const serializedLink = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  siteName: z.string().optional(),
});
const serializedMessage: z.ZodType = z.lazy(() => z.object({
  _type: z.literal("chat:Message"),
  attachments: z.array(serializedAttachment),
  author: serializedAuthor,
  formatted: formattedRoot,
  id: z.string(),
  isMention: z.boolean().optional(),
  links: z.array(serializedLink).optional(),
  metadata: z.object({ dateSent: validDate, edited: z.boolean(), editedAt: validDate.optional() }),
  raw: z.unknown(),
  replyTo: serializedMessage.optional(),
  text: z.string(),
  threadId: z.string(),
}).refine((message) => Object.hasOwn(message, "raw")));

const parseQueueEntry = (value: unknown): QueueEntry | undefined => {
  const entry = asRecord(value);
  if (
    !entry
    || typeof entry.enqueuedAt !== "number"
    || !Number.isFinite(entry.enqueuedAt)
    || typeof entry.expiresAt !== "number"
    || !Number.isFinite(entry.expiresAt)
  ) return undefined;
  const message = serializedMessage.safeParse(entry.message);
  if (!message.success) return undefined;
  try {
    return {
      enqueuedAt: entry.enqueuedAt,
      expiresAt: entry.expiresAt,
      message: Message.fromJSON(message.data as SerializedMessage),
    };
  } catch {
    return undefined;
  }
};

const parsePersistedState = (value: unknown): PersistedState => {
  const root = asRecord(value);
  const subscriptions = Array.isArray(root?.subscriptions)
    ? root.subscriptions.filter((subscription): subscription is string => typeof subscription === "string")
    : [];
  const cache: Record<string, CacheEntry> = {};
  const rawCache = asRecord(root?.cache);
  for (const [key, value] of Object.entries(rawCache ?? {})) {
    const entry = parseCacheEntry(value);
    if (entry) cache[key] = entry;
  }
  const queues: Record<string, QueueEntry[]> = {};
  const rawQueues = asRecord(root?.queues);
  for (const [threadId, value] of Object.entries(rawQueues ?? {})) {
    if (!Array.isArray(value)) continue;
    queues[threadId] = value.flatMap((entry) => {
      const parsed = parseQueueEntry(entry);
      return parsed ? [parsed] : [];
    });
  }
  return { subscriptions, cache, queues };
};

/**
 * Durable single-process Chat SDK state for the always-on hackathon service.
 *
 * Subscriptions and cached state survive a restart on the configured volume.
 * Locks intentionally remain process-local; a multi-instance deployment should
 * replace this adapter with Redis or Postgres state.
 */
export class FileChatState implements StateAdapter {
  #subscriptions = new Set<string>();
  #cache = new Map<string, CacheEntry>();
  #queues = new Map<string, QueueEntry[]>();
  #locks = new Map<string, Lock>();
  #loaded?: Promise<void>;
  readonly #writer: AtomicFileWriter;
  #connected = false;

  constructor(private readonly filePath: string) {
    this.#writer = new AtomicFileWriter(filePath);
  }

  async connect(): Promise<void> {
    if (this.#connected) return;
    await this.#load();
    this.#connected = true;
  }

  async disconnect(): Promise<void> {
    await this.#ensureConnected();
    await this.#persist();
    this.#connected = false;
  }

  async subscribe(threadId: string): Promise<void> {
    await this.#ensureConnected();
    this.#subscriptions.add(threadId);
    await this.#persist();
  }

  async unsubscribe(threadId: string): Promise<void> {
    await this.#ensureConnected();
    this.#subscriptions.delete(threadId);
    await this.#persist();
  }

  async isSubscribed(threadId: string): Promise<boolean> {
    await this.#ensureConnected();
    return this.#subscriptions.has(threadId);
  }

  async acquireLock(threadId: string, ttlMs: number): Promise<Lock | null> {
    await this.#ensureConnected();
    this.#removeExpiredLocks();
    const existing = this.#locks.get(threadId);
    if (existing) return null;
    const lock: Lock = { threadId, token: randomUUID(), expiresAt: Date.now() + ttlMs };
    this.#locks.set(threadId, lock);
    return lock;
  }

  async forceReleaseLock(threadId: string): Promise<void> {
    await this.#ensureConnected();
    this.#locks.delete(threadId);
  }

  async releaseLock(lock: Lock): Promise<void> {
    await this.#ensureConnected();
    const existing = this.#locks.get(lock.threadId);
    if (existing?.token === lock.token) this.#locks.delete(lock.threadId);
  }

  async extendLock(lock: Lock, ttlMs: number): Promise<boolean> {
    await this.#ensureConnected();
    const existing = this.#locks.get(lock.threadId);
    if (!existing || existing.token !== lock.token || existing.expiresAt <= Date.now()) {
      this.#locks.delete(lock.threadId);
      return false;
    }
    existing.expiresAt = Date.now() + ttlMs;
    return true;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    await this.#ensureConnected();
    const entry = this.#cache.get(key);
    if (!entry) return null;
    if (this.#isExpired(entry)) {
      this.#cache.delete(key);
      await this.#persist();
      return null;
    }
    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.#ensureConnected();
    this.#cache.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : null });
    await this.#persist();
  }

  async setIfNotExists(key: string, value: unknown, ttlMs?: number): Promise<boolean> {
    await this.#ensureConnected();
    const existing = this.#cache.get(key);
    if (existing && !this.#isExpired(existing)) return false;
    this.#cache.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : null });
    await this.#persist();
    return true;
  }

  async delete(key: string): Promise<void> {
    await this.#ensureConnected();
    this.#cache.delete(key);
    await this.#persist();
  }

  async appendToList(key: string, value: unknown, options?: { maxLength?: number; ttlMs?: number }): Promise<void> {
    await this.#ensureConnected();
    const existing = this.#cache.get(key);
    const list = existing && !this.#isExpired(existing) && Array.isArray(existing.value) ? [...existing.value] : [];
    list.push(value);
    if (options?.maxLength && list.length > options.maxLength) list.splice(0, list.length - options.maxLength);
    this.#cache.set(key, { value: list, expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : null });
    await this.#persist();
  }

  async getList<T = unknown>(key: string): Promise<T[]> {
    const value = await this.get<unknown[]>(key);
    return Array.isArray(value) ? value as T[] : [];
  }

  async enqueue(threadId: string, entry: QueueEntry, maxSize: number): Promise<number> {
    await this.#ensureConnected();
    const queue = (this.#queues.get(threadId) ?? []).filter(({ expiresAt }) => expiresAt > Date.now());
    queue.push(entry);
    if (queue.length > maxSize) queue.splice(0, queue.length - maxSize);
    this.#queues.set(threadId, queue);
    await this.#persist();
    return queue.length;
  }

  async dequeue(threadId: string): Promise<QueueEntry | null> {
    await this.#ensureConnected();
    const queue = (this.#queues.get(threadId) ?? []).filter(({ expiresAt }) => expiresAt > Date.now());
    const entry = queue.shift() ?? null;
    if (queue.length > 0) this.#queues.set(threadId, queue);
    else this.#queues.delete(threadId);
    await this.#persist();
    return entry;
  }

  async queueDepth(threadId: string): Promise<number> {
    await this.#ensureConnected();
    const previous = this.#queues.get(threadId) ?? [];
    const queue = previous.filter(({ expiresAt }) => expiresAt > Date.now());
    if (queue.length > 0) this.#queues.set(threadId, queue);
    else this.#queues.delete(threadId);
    if (queue.length !== previous.length) await this.#persist();
    return queue.length;
  }

  async #ensureConnected(): Promise<void> {
    if (!this.#connected) await this.connect();
  }

  async #load(): Promise<void> {
    this.#loaded ??= (async () => {
      try {
        const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
        const state = parsePersistedState(parsed);
        this.#subscriptions = new Set(state.subscriptions);
        this.#cache = new Map(Object.entries(state.cache));
        this.#queues = new Map(Object.entries(state.queues));
      } catch (error) {
        const code = error instanceof Error && "code" in error ? error.code : undefined;
        if (code !== "ENOENT") throw error;
      }
    })();
    await this.#loaded;
  }

  #isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  #removeExpiredLocks(): void {
    const now = Date.now();
    for (const [threadId, lock] of this.#locks) if (lock.expiresAt <= now) this.#locks.delete(threadId);
  }

  #persist(): Promise<void> {
    const state: PersistedState = {
      subscriptions: [...this.#subscriptions],
      cache: Object.fromEntries(this.#cache),
      queues: Object.fromEntries(this.#queues),
    };
    return this.#writer.write(JSON.stringify(state));
  }
}
