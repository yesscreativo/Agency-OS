"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@agency-os/ui";
import { createHolidayAction, deleteHolidayAction } from "@/lib/leave-actions";

export interface HolidayRow {
  id: string;
  date: string;
  name: string;
}

export function HolidaysManager({ holidays }: { holidays: HolidayRow[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () => {
    setError(null);
    startTransition(async () => {
      const result = await createHolidayAction(date, name);
      if (result.error) return setError(result.error);
      setDate("");
      setName("");
      router.refresh();
    });
  };

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteHolidayAction(id);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Festivos colombianos usados para calcular días hábiles (excluye sábados, domingos y estas fechas).
      </p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="mb-6 flex items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted">Fecha</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted">Nombre</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Día de la Independencia" />
        </div>
        <Button variant="primary" onClick={add} disabled={pending}>
          Agregar
        </Button>
      </div>

      <div className="space-y-1">
        {holidays.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between rounded-md border border-line bg-glass px-3 py-2 backdrop-blur-xl"
          >
            <span className="text-sm text-ink">
              {h.date} — {h.name}
            </span>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(h.id)}>
              Quitar
            </Button>
          </div>
        ))}
        {holidays.length === 0 && <p className="text-sm text-faint">Sin festivos cargados todavía.</p>}
      </div>
    </div>
  );
}
