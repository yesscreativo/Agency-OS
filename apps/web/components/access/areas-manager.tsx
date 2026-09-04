"use client";

// Catálogo de Áreas (solo super admin, vive en /usuarios): crear un área con
// su gerente, o cambiar el gerente de una ya creada. Borrar áreas no está en
// alcance (ver spec).

import { useState, useTransition } from "react";
import { Button, Label, Modal, Select, Table, Td, Th } from "@agency-os/ui";
import { createAreaAction, updateAreaManagerAction } from "@/lib/access-actions";

export interface AreaRow {
  id: string;
  name: string;
  managerUserId: string | null;
  managerName: string | null;
}

interface AreasManagerProps {
  areas: AreaRow[];
  users: { id: string; fullName: string }[];
}

export function AreasManager({ areas, users }: AreasManagerProps) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AreaRow | null>(null);
  const [name, setName] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openCreate = () => {
    setCreating(true);
    setName("");
    setManagerUserId("");
    setError(null);
  };

  const submitCreate = () => {
    if (!name.trim() || !managerUserId) return;
    startTransition(async () => {
      const result = await createAreaAction(name, managerUserId);
      if (result.error) setError(result.error);
      else setCreating(false);
    });
  };

  const openEdit = (area: AreaRow) => {
    setEditing(area);
    setManagerUserId(area.managerUserId ?? "");
    setError(null);
  };

  const submitEdit = () => {
    if (!editing || !managerUserId) return;
    startTransition(async () => {
      const result = await updateAreaManagerAction(editing.id, managerUserId);
      if (result.error) setError(result.error);
      else setEditing(null);
    });
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight">Áreas</h2>
        <Button variant="outline" size="sm" onClick={openCreate}>
          + Nueva área
        </Button>
      </div>

      {areas.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Todavía no hay áreas creadas.</p>
      ) : (
        <div className="mt-3">
          <Table>
            <thead>
              <tr>
                <Th>Área</Th>
                <Th>Gerente</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id} className="transition hover:bg-surface-2">
                  <Td>{a.name}</Td>
                  <Td>{a.managerName ?? "—"}</Td>
                  <Td className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
                      Cambiar gerente
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nueva área"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={pending || !name.trim() || !managerUserId}>
              {pending ? "Creando…" : "Crear"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="area-name">Nombre</Label>
            <input
              id="area-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Diseño"
              className="w-full rounded border border-line-strong bg-surface px-3.5 py-3 text-sm text-ink outline-none focus:border-green"
            />
          </div>
          <div>
            <Label htmlFor="area-manager">Gerente</Label>
            <Select id="area-manager" value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
              <option value="">Selecciona un usuario…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {error && creating && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Cambiar gerente"
        description={editing ? `Área "${editing.name}".` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={submitEdit} disabled={pending || !managerUserId}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <Label htmlFor="area-manager-edit">Gerente</Label>
        <Select id="area-manager-edit" value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
          <option value="">Selecciona un usuario…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
        {error && editing && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
