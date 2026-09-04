import Link from "next/link";

/** Panel de "acceso denegado" reutilizable: se muestra cuando el usuario llega a
 * una ruta de un módulo o recurso para el que no tiene permiso, en vez de
 * rebotarlo en silencio a otra página (mejor UX para enlaces de notificación). */
export function NoAccessPanel({
  title = "No tienes acceso",
  message,
  backHref = "/inicio",
  backLabel = "Volver al inicio",
}: {
  title?: string;
  message: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-glass px-8 py-16 text-center backdrop-blur-xl">
      <div className="flex h-12 w-12 items-center justify-center rounded-pill border border-line text-muted">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <p className="max-w-[46ch] text-sm text-muted">{message}</p>
      <Link
        href={backHref}
        className="mt-2 rounded-pill bg-green px-4 py-2 text-sm font-semibold text-green-ink transition hover:brightness-105"
      >
        {backLabel}
      </Link>
    </div>
  );
}
