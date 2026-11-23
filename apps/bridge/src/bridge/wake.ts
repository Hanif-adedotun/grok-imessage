export type WakePayload = {
  text: string;
  from: string;
  space_id?: string;
  message_id?: string;
  platform: string;
  reply_url: string;
  reply_token: string;
  correlation_id: string;
  sent_at: string;
};

/** Minimal fetch surface — avoids Bun's `typeof fetch` (includes `preconnect`). */
export type WakeFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type WakeDeps = {
  fetch: WakeFetch;
  url: string;
  key: string;
  /** Abort the wake HTTP call after this many ms (default 15_000). */
  timeoutMs?: number;
};

export type WakeResult =
  | { ok: true }
  | { ok: false; reason: "misconfigured" }
  | { ok: false; reason: "http"; status: number; body: string }
  | { ok: false; reason: "network"; body: string }
  | { ok: false; reason: "timeout" };

export async function wakeGrokBot(deps: WakeDeps, payload: WakePayload): Promise<WakeResult> {
  const url = deps.url.trim();
  const key = deps.key.trim();
  if (!url || !key) {
    return { ok: false, reason: "misconfigured" };
  }

  const timeoutMs = deps.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await deps.fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      controller.signal.aborted;
    if (aborted) return { ok: false, reason: "timeout" };
    const body = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "network", body };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return { ok: false, reason: "http", status: res.status, body: await res.text() };
  }

  return { ok: true };
}
