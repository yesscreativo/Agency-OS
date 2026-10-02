import { getCurrentClientContact } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const contact = await getCurrentClientContact();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Hola, {contact?.fullName}</h1>
      <p className="mt-2 text-sm text-[#a1a1aa]">
        Todavía no hay nada para mostrar acá — pronto vas a poder ver tus tickets y el contenido de
        tus redes directamente desde este portal.
      </p>
    </div>
  );
}
