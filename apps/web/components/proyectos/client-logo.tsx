"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@agency-os/ui";
import { uploadClientLogo, removeClientLogo } from "@/lib/client-logo-actions";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "—";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + (parts[parts.length - 1] ?? first).charAt(0)).toUpperCase();
}

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-16 w-16 text-xl",
} as const;

/** Logo del cliente (imagen del bucket público) con iniciales como fallback. */
export function ClientAvatar({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl: string | null;
  size?: keyof typeof SIZES;
}) {
  const cls = SIZES[size];
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={`${cls} shrink-0 rounded-md border border-line object-cover`}
      />
    );
  }
  return (
    <div
      className={`${cls} flex shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 font-semibold text-muted`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Encabezado del space del cliente: logo grande + subir/cambiar/quitar. */
export function ClientLogoUploader({
  clientId,
  name,
  company,
  initialLogoUrl,
  canManage,
}: {
  clientId: string;
  name: string;
  company: string | null;
  initialLogoUrl: string | null;
  canManage: boolean;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_LOGO_BYTES) {
      setError("La imagen supera el límite de 2 MB.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadClientLogo(clientId, fd);
      if (res.error) setError(res.error);
      else setLogoUrl(res.logoUrl ?? null);
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const onRemove = () => {
    setError(null);
    startTransition(async () => {
      const res = await removeClientLogo(clientId);
      if (res.error) setError(res.error);
      else setLogoUrl(null);
    });
  };

  return (
    <div className="flex items-center gap-4">
      <ClientAvatar name={name} logoUrl={logoUrl} size="lg" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
        {company && <p className="text-sm text-muted">{company}</p>}
        {canManage && (
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onFile(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isPending}
            >
              {isPending ? "Subiendo…" : logoUrl ? "Cambiar logo" : "Subir logo"}
            </Button>
            {logoUrl && (
              <Button variant="ghost" size="sm" type="button" onClick={onRemove} disabled={isPending}>
                Quitar
              </Button>
            )}
          </div>
        )}
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
