let cachedBase: string | null = null;
let inflight: Promise<string> | null = null;

async function probeHealth(base: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  let lastErr: unknown = null;
  // The PyInstaller --onedir bundle launches in ~1s after the OS file cache
  // is warm. First-ever launch on a fresh install can take up to ~15s while
  // macOS validates the unsigned bundle and the Python interpreter cold-starts.
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
      lastErr = new Error(`status ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `backend not reachable after ${timeoutMs}ms: ${String(lastErr ?? "timeout")}`,
  );
}

async function resolveBaseUrl(): Promise<string> {
  if (cachedBase) return cachedBase;
  if (inflight) return inflight;

  inflight = (async () => {
    const isTauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    let base: string;
    if (isTauri) {
      // Use the low-level IPC that Tauri injects into every WebView at runtime.
      // This avoids a hard dependency on the @tauri-apps/api npm package while
      // still correctly calling the `backend_port` Rust command.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const internals = (window as any).__TAURI_INTERNALS__;
      const port: number = await internals.invoke("backend_port");
      base = `http://127.0.0.1:${port}/api`;
    } else {
      // Browser dev mode: hit Vite proxy on the same origin
      base = "/api";
    }

    // Sidecar may need a moment to bind the port after Tauri spawns it.
    // Wait until /health responds before letting any query through.
    await probeHealth(base);
    cachedBase = base;
    return base;
  })();

  try {
    return await inflight;
  } catch (err) {
    // Allow callers to retry after a failed probe instead of caching the failure.
    inflight = null;
    throw err;
  }
}

export { resolveBaseUrl };
