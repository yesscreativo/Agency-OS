"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "./modal";

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

/** true si el adjunto es una imagen previsualizable. Usa el mime type cuando
 * se conoce (excluye SVG a propósito — puede subirse con otro content-type y
 * no debe previsualizarse igual que un raster); si no hay mime type (p. ej.
 * adjuntos de RRHH, que solo guardan la ruta), cae a la extensión del nombre. */
export function isPreviewableImage(filename: string, mimeType?: string | null): boolean {
  if (mimeType) return mimeType.startsWith("image/") && !mimeType.startsWith("image/svg");
  return IMAGE_EXTENSION_RE.test(filename);
}

export interface AttachmentLinkProps {
  url: string;
  filename: string;
  mimeType?: string | null;
  className?: string;
  children?: ReactNode;
}

/** Enlace a un adjunto, con el mismo criterio en todo el proyecto: una imagen
 * se previsualiza en un modal; cualquier otro archivo se abre en pestaña
 * nueva (comportamiento histórico, deja que el navegador decida descargar o
 * mostrarlo). */
export function AttachmentLink({ url, filename, mimeType, className, children }: AttachmentLinkProps) {
  const [open, setOpen] = useState(false);

  if (!isPreviewableImage(filename, mimeType)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={className} title={filename}>
        {children ?? filename}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} title={filename}>
        {children ?? filename}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={filename}
        size="lg"
        footer={
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-pill border border-line-strong px-4 py-2 text-center text-[13px] font-semibold text-ink transition hover:border-green"
          >
            Abrir en pestaña nueva ↗
          </a>
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={filename} className="max-h-[70vh] w-full rounded-md object-contain" />
      </Modal>
    </>
  );
}
