"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@agency-os/ui";
import { deleteProjectAction } from "@/lib/project-actions";

/** Borra el proyecto (en cascada: también sus tareas/subtareas). Mismo patrón
 * de confirmación en 2 clicks que `work-item-detail.tsx`/`work-item-editor.tsx`
 * ("Eliminar" → "¿Confirmar?" → ejecuta). */
export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteProjectAction(projectId);
      if (res.error) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      router.push("/proyectos");
    });
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-danger">{error}</span>}
      <Button variant="danger" size="sm" onClick={onClick} disabled={isPending}>
        {confirming ? "¿Confirmar? Se borra con sus tareas" : "Eliminar proyecto"}
      </Button>
      {confirming && (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
          Cancelar
        </Button>
      )}
    </div>
  );
}
