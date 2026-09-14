"use client";

// Mínimo de horas diarias que dispara la alerta de "horas no registradas"
// (`notify_missing_hours`, cron diario lun-vie 4pm Colombia). Editable por el
// gerente del área, mismo patrón que OverloadThresholdEditor.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@agency-os/ui";
import { updateAreaMinDailyMinutesAction } from "@/lib/mi-area-actions";

export function MinDailyHoursEditor({ areaId, minutes }: { areaId: string; minutes: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onBlur = (value: string) => {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours <= 0) return;
    const nextMinutes = Math.round(hours * 60);
    if (nextMinutes === minutes) return;
    setError(null);
    startTransition(async () => {
      const res = await updateAreaMinDailyMinutesAction(areaId, nextMinutes);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="min-daily-hours" className="whitespace-nowrap text-sm text-muted">
        Alertar con menos de
      </Label>
      <Input
        id="min-daily-hours"
        type="number"
        min={0.5}
        step={0.5}
        defaultValue={minutes / 60}
        disabled={isPending}
        onBlur={(e) => onBlur(e.target.value)}
        className="w-20"
      />
      <span className="text-sm text-muted">horas al día</span>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
