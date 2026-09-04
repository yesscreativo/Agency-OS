"use client";

// Colaboradores del área (gerente): asignar/cambiar el cargo de cada uno.

import { useState, useTransition } from "react";
import { Badge, Button, Label, Modal, Select, Table, Td, Th } from "@agency-os/ui";
import { assignPersonJobTitleAction } from "@/lib/mi-area-actions";
import type { JobTitleOption } from "./job-titles-manager";

export interface AreaCollaborator {
  id: string;
  fullName: string;
  jobTitleId: string | null;
  jobTitleName: string | null;
}

export function AreaCollaborators({
  areaId,
  people,
  jobTitles,
}: {
  areaId: string;
  people: AreaCollaborator[];
  jobTitles: JobTitleOption[];
}) {
  const [assigning, setAssigning] = useState<AreaCollaborator | null>(null);
  const [jobTitleId, setJobTitleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openAssign = (person: AreaCollaborator) => {
    setAssigning(person);
    setJobTitleId(person.jobTitleId ?? "");
    setError(null);
  };

  const submit = () => {
    if (!assigning) return;
    startTransition(async () => {
      const res = await assignPersonJobTitleAction(assigning.id, areaId, jobTitleId || null);
      if (res.error) setError(res.error);
      else setAssigning(null);
    });
  };

  return (
    <section className="mt-6 rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
      <h2 className="font-semibold text-ink">Colaboradores de mi área</h2>
      <div className="mt-3">
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Cargo</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="transition hover:bg-surface-2">
                <Td>{p.fullName}</Td>
                <Td>{p.jobTitleName ? <Badge tone="neutral">{p.jobTitleName}</Badge> : "—"}</Td>
                <Td className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openAssign(p)}>
                    Asignar cargo
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {people.length === 0 && <p className="mt-3 text-sm text-muted">Todavía no hay colaboradores en esta área.</p>}
      </div>

      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Asignar cargo"
        description={assigning ? `Cargo de ${assigning.fullName}.` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <Label htmlFor="assign-job-title">Cargo</Label>
        <Select id="assign-job-title" value={jobTitleId} onChange={(e) => setJobTitleId(e.target.value)}>
          <option value="">Sin cargo</option>
          {jobTitles.map((jt) => (
            <option key={jt.id} value={jt.id}>
              {jt.name}
            </option>
          ))}
        </Select>
        {error && assigning && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </section>
  );
}
