import "server-only";

/** Publica un evento de dominio a n8n (best-effort: si n8n no está configurado o
 * falla, se registra y se sigue — el flujo de negocio no se bloquea por el bus). */
export async function emitWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  const baseUrl = process.env.N8N_WEBHOOK_BASE_URL;
  if (!baseUrl) {
    console.warn(`emitWebhook(${event}): N8N_WEBHOOK_BASE_URL no configurado, se omite.`);
    return;
  }
  try {
    const response = await fetch(`${baseUrl}/${event}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`emitWebhook(${event}): n8n respondió ${response.status}`);
    }
  } catch (error) {
    console.error(`emitWebhook(${event})`, error);
  }
}
