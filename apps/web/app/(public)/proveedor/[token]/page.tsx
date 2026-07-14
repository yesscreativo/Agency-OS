export default async function SupplierResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <main className="p-8">Vista pública de proveedor ({token}) — pendiente (Fase 6).</main>;
}
