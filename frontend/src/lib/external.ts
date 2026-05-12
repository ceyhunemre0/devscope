/** Open a URL in the user's default browser, whether we're in Tauri or plain web. */
export async function openExternal(url: string): Promise<void> {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = (window as any).__TAURI_INTERNALS__;
    await internals.invoke("plugin:shell|open", { path: url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
