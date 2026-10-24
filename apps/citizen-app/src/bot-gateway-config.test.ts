import { describe, expect, it } from "vitest";
import { botGatewayConfig, resolveDevHost } from "./bot-gateway-config";

describe("botGatewayConfig", () => {
  it("reports a missing gateway URL", () => {
    expect(botGatewayConfig(undefined)).toEqual({ kind: "missing" });
    expect(botGatewayConfig("   ")).toEqual({ kind: "missing" });
  });

  it("normalizes an HTTP gateway URL", () => {
    expect(botGatewayConfig(" http://192.168.1.20:2000/ ")).toEqual({
      kind: "ready",
      host: "http://192.168.1.20:2000",
    });
  });

  it("rejects malformed and unsupported URLs", () => {
    expect(botGatewayConfig("gateway.local")).toEqual({
      kind: "invalid",
      value: "gateway.local",
    });
    expect(botGatewayConfig("file:///tmp/gateway")).toEqual({
      kind: "invalid",
      value: "file:///tmp/gateway",
    });
  });

  it("resolves localhost upload URLs to LAN IP while preserving path and query", () => {
    (globalThis as any).nativeExtensions = {
      SourceCode: { scriptURL: "http://192.168.1.41:8081/index.bundle" },
    };
    const resolved = resolveDevHost(
      "http://127.0.0.1:3210/api/storage/upload?token=123xyz",
    );
    expect(resolved).toBe(
      "http://192.168.1.41:3210/api/storage/upload?token=123xyz",
    );
    delete (globalThis as any).nativeExtensions;
  });

  it("resolves undefined with defaultPort to LAN IP", () => {
    (globalThis as any).nativeExtensions = {
      SourceCode: { scriptURL: "http://192.168.1.41:8081/index.bundle" },
    };
    expect(resolveDevHost(undefined, 3210)).toBe("http://192.168.1.41:3210");
    delete (globalThis as any).nativeExtensions;
  });
});
