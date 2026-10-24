export type BotGatewayConfig =
  | { kind: "ready"; host: string }
  | { kind: "missing" }
  | { kind: "invalid"; value: string };

function getScriptURL(): string | undefined {
  try {
    const g = globalThis as Record<string, any>;
    const scriptURL =
      g?.nativeExtensions?.SourceCode?.scriptURL ??
      g?.RN$NativeModules?.SourceCode?.scriptURL ??
      g?.NativeModules?.SourceCode?.scriptURL;
    if (typeof scriptURL === "string" && scriptURL.length > 0) {
      return scriptURL;
    }
  } catch {
    // Ignore
  }
  return undefined;
}

export function resolveDevHost(
  value: string | undefined,
  defaultPort?: number,
): string | undefined {
  const candidate = value?.trim();
  if (!candidate && !defaultPort) return undefined;
  const target = candidate || `http://127.0.0.1:${defaultPort}`;

  // Pure string matching preserves exact path, query strings (?token=...), and hashes
  // without relying on runtime-specific URL polyfills in React Native.
  const hostMatch = target.match(
    /^(https?:\/\/)(localhost|127\.0\.0\.1)(?::(\d+))?(\/.*)?$/i,
  );
  if (hostMatch) {
    const scriptURL = getScriptURL();
    let targetHost = "127.0.0.1";
    if (typeof scriptURL === "string" && scriptURL.length > 0) {
      const match = scriptURL.match(/^https?:\/\/([^/:]+)/i);
      if (
        match &&
        match[1] &&
        match[1] !== "localhost" &&
        match[1] !== "127.0.0.1"
      ) {
        targetHost = match[1];
      }
    }
    const protocol = hostMatch[1];
    const port = hostMatch[3]
      ? `:${hostMatch[3]}`
      : defaultPort
        ? `:${defaultPort}`
        : "";
    const rest = hostMatch[4] || "";
    return `${protocol}${targetHost}${port}${rest}`;
  }

  return candidate ? candidate.replace(/\/$/, "") : target;
}

export function botGatewayConfig(value: string | undefined): BotGatewayConfig {
  const resolved = resolveDevHost(value);
  const candidate = resolved?.trim();
  if (!candidate) return { kind: "missing" };

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { kind: "invalid", value: candidate };
    }

    return { kind: "ready", host: url.toString().replace(/\/$/, "") };
  } catch {
    return { kind: "invalid", value: candidate };
  }
}
