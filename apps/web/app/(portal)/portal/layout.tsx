import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentClientContact } from "@/lib/portal-auth";
import { portalLogout } from "@/lib/portal-actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const contact = await getCurrentClientContact();
  if (!contact) {
    const internalUser = await getCurrentUser();
    redirect(internalUser ? "/inicio" : "/portal/login");
  }
  if (contact.status === "disabled") redirect("/portal/login");

  return (
    <div className="min-h-screen bg-[#050506] text-[#f6f6f7]">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/images/logo-Aos.png" alt="Agency OS" className="h-5 w-auto" />
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[#a1a1aa]">{contact.clientName}</span>
          <form action={portalLogout}>
            <button
              type="submit"
              className="cursor-pointer rounded-pill border border-white/15 px-3.5 py-2 text-xs font-semibold transition hover:border-[#b8ff3c]"
            >
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-[1000px] px-8 py-10">{children}</main>
    </div>
  );
}
