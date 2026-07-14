import { NextResponse } from "next/server";

// Proxy server-side al webhook de n8n correspondiente. Reemplaza el `config.php` del
// cotizador viejo: el secreto (N8N_WEBHOOK_BASE_URL) vive en env, nunca en el cliente.
// Implementación real (payloads por evento) pendiente de Fase 6.
export async function POST(request: Request, { params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  const baseUrl = process.env.N8N_WEBHOOK_BASE_URL;

  if (!baseUrl) {
    return NextResponse.json({ error: "N8N_WEBHOOK_BASE_URL no configurado" }, { status: 500 });
  }

  const body = await request.json();
  const response = await fetch(`${baseUrl}/${event}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return NextResponse.json(await response.json(), { status: response.status });
}
