export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="p-8">Cliente {id} — pendiente (Fase 7).</main>;
}
