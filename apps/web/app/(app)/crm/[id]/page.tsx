export default async function QuoteFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="p-8">Cotización {id} — pendiente (Fase 5).</main>;
}
