export default async function ClientResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <main className="p-8">Vista pública de cliente ({token}) — pendiente (Fase 6).</main>;
}
