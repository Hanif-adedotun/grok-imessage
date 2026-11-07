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

export async function wakeGrokBot(payload: WakePayload): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const url = process.env.GROK_BOT_WEBHOOK_URL;
  const key = process.env.GROK_BOT_WEBHOOK_KEY;

  if (!url || !key) {
    return { ok: false, status: 0, body: "GROK_BOT_WEBHOOK_URL / GROK_BOT_WEBHOOK_KEY not configured" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }

  return { ok: true };
}
