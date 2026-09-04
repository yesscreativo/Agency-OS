"use client";

// Catálogo de cargos del área (gerente): crear + renombrar. Sin borrar (fuera
// de alcance del spec).

import { useState, useTransition } from "react";
import { Button, Input } from "@agency-os/ui";
import { createJobTitleAction, renameJobTitleAction } from "@/lib/mi-area-actions";

export interface JobTitleOption {
  id: string;
  name: string;
}

export function JobTitlesManager({ areaId, jobTitles }: { areaId: string; jobTitles: JobTitleOption[] }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onCreate = () => {
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createJobTitleAction(areaId, newName);
      if (res.error) setError(res.error);
      else setNewName("");
    });
  };

  const startEdit = (jt: JobTitleOption) => {
    setEditingId(jt.id);
    setEditName(jt.name);
    setError(null);
  };

  const onRename = () => {
    if (!editingId || !editName.trim()) return;
    startTransition(async () => {
      const res = await renameJobTitleAction(editingId, areaId, editName);
      if (res.error) setError(res.error);
      else setEditingId(null);
    });
  };

  return (
    <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
      <h2 className="font-semibold text-ink">Cargos de mi área</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {jobTitles.map((jt) =>
          editingId === jt.id ? (
            <div key={jt.id} className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-40"
              />
              <Button size="sm" onClick={onRename} disabled={pending}>
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <button
              key={jt.id}
              type="button"
              onClick={() => startEdit(jt)}
              className="rounded-pill border border-line-strong px-3 py-1.5 text-sm text-ink transition hover:border-green"
            >
              {jt.name}
            </button>
          ),
        )}
        {jobTitles.length === 0 && <p className="text-sm text-muted">Todavía no hay cargos.</p>}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
          placeholder="Nuevo cargo…"
          className="w-56"
        />
        <Button size="sm" onClick={onCreate} disabled={pending || !newName.trim()}>
          Agregar
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
