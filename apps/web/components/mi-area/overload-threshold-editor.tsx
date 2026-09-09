"use client";

// Umbral de "carga alta" (tareas abiertas) que dispara la alerta acá y en el
// dashboard de Proyectos. Editable por el gerente del área.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@agency-os/ui";
import { updateAreaOverloadThresholdAction } from "@/lib/mi-area-actions";

export function OverloadThresholdEditor({
  areaId,
  threshold,
}: {
  areaId: string;
  threshold: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onBlur = (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed === threshold) return;
    setError(null);
    startTransition(async () => {
      const res = await updateAreaOverloadThresholdAction(areaId, parsed);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="overload-threshold" className="whitespace-nowrap text-sm text-muted">
        Alertar con más de
      </Label>
      <Input
        id="overload-threshold"
        type="number"
        min={1}
        defaultValue={threshold}
        disabled={isPending}
        onBlur={(e) => onBlur(e.target.value)}
        className="w-20"
      />
      <span className="text-sm text-muted">tareas abiertas</span>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
