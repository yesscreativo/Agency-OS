"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Textarea } from "@agency-os/ui";
import { LEAVE_REQUEST_TYPE_LABELS, type LeaveRequestType } from "@agency-os/domain";

export interface PendingRequestRow {
  id: string;
  type: LeaveRequestType;
  startDate: string;
  endDate: string;
  requesterName: string;
  notes: string | null;
}

function QueueSection({
  title,
  items,
  onDecide,
  pendingId,
}: {
  title: string;
  items: PendingRequestRow[];
  onDecide: (id: string, status: "approved" | "rejected", reason?: string) => void;
  pendingId: string | null;
}) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (items.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{title}</h2>
      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="rounded-lg border border-line bg-glass p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-ink">{r.requesterName}</span>
                <Badge tone="neutral" className="ml-2">
                  {LEAVE_REQUEST_TYPE_LABELS[r.type]}
                </Badge>
              </div>
              <span className="text-sm text-muted">
                {r.startDate} · {r.endDate}
              </span>
            </div>
            {r.notes && <p className="mt-1 text-sm text-muted">{r.notes}</p>}

            {rejectingId === r.id ? (
              <div className="mt-3 flex flex-col gap-2">
                <Textarea
                  autoFocus
                  placeholder="Motivo del rechazo…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRejectingId(null)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={pendingId === r.id}
                    onClick={() => {
                      onDecide(r.id, "rejected", reason);
                      setRejectingId(null);
                      setReason("");
                    }}
                  >
                    Confirmar rechazo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={pendingId === r.id} onClick={() => setRejectingId(r.id)}>
                  Rechazar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={pendingId === r.id}
                  onClick={() => onDecide(r.id, "approved")}
                >
                  Aprobar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ApprovalQueue({
  asManager,
  asHr,
  onDecideManager,
  onDecideHr,
}: {
  asManager: PendingRequestRow[];
  asHr: PendingRequestRow[];
  onDecideManager: (id: string, status: "approved" | "rejected", reason?: string) => Promise<{ error?: string }>;
  onDecideHr: (id: string, status: "approved" | "rejected", reason?: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const decide = (
    id: string,
    status: "approved" | "rejected",
    reason: string | undefined,
    action: (id: string, status: "approved" | "rejected", reason?: string) => Promise<{ error?: string }>,
  ) => {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await action(id, status, reason);
      setPendingId(null);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  };

  if (asManager.length === 0 && asHr.length === 0) {
    return <p className="text-sm text-faint">No tienes solicitudes pendientes de aprobar.</p>;
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
          {error}
        </div>
      )}
      <QueueSection
        title="Como jefe directo"
        items={asManager}
        pendingId={pendingId}
        onDecide={(id, status, reason) => decide(id, status, reason, onDecideManager)}
      />
      <QueueSection
        title="Como RRHH"
        items={asHr}
        pendingId={pendingId}
        onDecide={(id, status, reason) => decide(id, status, reason, onDecideHr)}
      />
    </div>
  );
}
