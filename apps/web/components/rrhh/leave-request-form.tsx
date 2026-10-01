"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError, Input, Label, Modal, Select, Textarea } from "@agency-os/ui";
import { LEAVE_REQUEST_TYPES, LEAVE_REQUEST_TYPE_LABELS, type LeaveRequestType } from "@agency-os/domain";
import { createLeaveRequestAction } from "@/lib/leave-actions";

const NEEDS_RETURN_DATE: LeaveRequestType = "vacaciones";
const NEEDS_ATTACHMENT: LeaveRequestType[] = ["licencia_medica", "otro"];

export function LeaveRequestForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<LeaveRequestType | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVacaciones = type === NEEDS_RETURN_DATE;
  const needsAttachment = type !== "" && NEEDS_ATTACHMENT.includes(type);

  const reset = () => {
    setType("");
    setStartDate("");
    setEndDate("");
    setReturnDate("");
    setNotes("");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    setError(null);
    if (!type) return setError("Selecciona el tipo de permiso.");
    if (!startDate || !endDate) return setError("Fecha de inicio y fin son obligatorias.");
    if (endDate < startDate) return setError("La fecha de fin no puede ser anterior al inicio.");
    if (isVacaciones && !returnDate) return setError("La fecha de retorno es obligatoria para Vacaciones.");
    const file = fileInputRef.current?.files?.[0];
    if (needsAttachment && !file) return setError("Este tipo de permiso requiere adjuntar un documento.");

    const fd = new FormData();
    fd.append("type", type);
    fd.append("start_date", startDate);
    fd.append("end_date", endDate);
    if (returnDate) fd.append("return_date", returnDate);
    if (notes.trim()) fd.append("notes", notes.trim());
    if (file) fd.append("attachment", file);

    startTransition(async () => {
      const result = await createLeaveRequestAction(fd);
      if (result.error) return setError(result.error);
      reset();
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Nueva solicitud" size="sm">
      <div className="space-y-4">
        {error && <FieldError>{error}</FieldError>}

        <div>
          <Label htmlFor="leave-type">Tipo de Permiso</Label>
          <Select
            id="leave-type"
            value={type}
            onChange={(e) => setType(e.target.value as LeaveRequestType)}
          >
            <option value="">Selecciona una opción</option>
            {LEAVE_REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAVE_REQUEST_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="leave-start">Fecha inicio</Label>
            <Input id="leave-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label htmlFor="leave-end">Fecha fin</Label>
            <Input id="leave-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        {isVacaciones && (
          <div>
            <Label htmlFor="leave-return">Fecha de retorno</Label>
            <Input id="leave-return" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
        )}

        {needsAttachment && (
          <div>
            <Label htmlFor="leave-attachment">Documento soporte</Label>
            <input
              ref={fileInputRef}
              id="leave-attachment"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              className="w-full text-sm text-muted"
            />
          </div>
        )}

        <div>
          <Label htmlFor="leave-notes">Observaciones (opcional)</Label>
          <Textarea id="leave-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            Enviar solicitud
          </Button>
        </div>
      </div>
    </Modal>
  );
}
