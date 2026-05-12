let cachedBase: string | null = null;

async function resolveBaseUrl(): Promise<string> {
  if (cachedBase) return cachedBase;

  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  if (isTauri) {
    // Use the low-level IPC that Tauri injects into every WebView at runtime.
    // This avoids a hard dependency on the @tauri-apps/api npm package while
    // still correctly calling the `backend_port` Rust command.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = (window as any).__TAURI_INTERNALS__;
    const port: number = await internals.invoke("backend_port");
    cachedBase = `http://127.0.0.1:${port}/api`;
  } else {
    // Browser dev mode: hit Vite proxy on the same origin
    cachedBase = "/api";
  }

  return cachedBase;
}

export { resolveBaseUrl };
