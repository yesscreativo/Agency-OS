"use client";

import { useState } from "react";
import { Badge, Button } from "@agency-os/ui";
import { LEAVE_REQUEST_TYPE_LABELS, leaveRequestStatusLabel, type LeaveApprovalStatus } from "@agency-os/domain";
import { LeaveRequestForm } from "./leave-request-form";

export interface MyRequestRow {
  id: string;
  type: keyof typeof LEAVE_REQUEST_TYPE_LABELS;
  startDate: string;
  endDate: string;
  managerStatus: LeaveApprovalStatus;
  hrStatus: LeaveApprovalStatus;
  managerRejectReason: string | null;
  hrRejectReason: string | null;
}

function statusTone(managerStatus: LeaveApprovalStatus, hrStatus: LeaveApprovalStatus) {
  if (managerStatus === "rejected" || hrStatus === "rejected") return "danger" as const;
  if (managerStatus === "approved" && hrStatus === "approved") return "success" as const;
  return "warn" as const;
}

export function MyRequestsList({ requests }: { requests: MyRequestRow[] }) {
  const [creating, setCreating] = useState(false);

  const approved = requests.filter((r) => r.managerStatus === "approved" && r.hrStatus === "approved").length;
  const rejected = requests.filter((r) => r.managerStatus === "rejected" || r.hrStatus === "rejected").length;
  const pending = requests.length - approved - rejected;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="text-ink">
            <strong>{approved}</strong> aprobadas
          </span>
          <span className="text-danger">
            <strong>{rejected}</strong> rechazadas
          </span>
          <span className="text-muted">
            <strong>{pending}</strong> pendientes
          </span>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          + Nueva solicitud
        </Button>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-faint">Todavía no tienes solicitudes.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-line bg-glass p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{LEAVE_REQUEST_TYPE_LABELS[r.type]}</span>
                <Badge tone={statusTone(r.managerStatus, r.hrStatus)}>
                  {leaveRequestStatusLabel(r.managerStatus, r.hrStatus)}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {r.startDate} · {r.endDate}
              </p>
              {r.managerRejectReason && (
                <p className="mt-1 text-xs text-danger">Motivo (jefe): {r.managerRejectReason}</p>
              )}
              {r.hrRejectReason && <p className="mt-1 text-xs text-danger">Motivo (RRHH): {r.hrRejectReason}</p>}
            </div>
          ))}
        </div>
      )}

      <LeaveRequestForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
