"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@agency-os/domain";
import { Badge, Button, Input, Label, Modal, Select, Table, Td, Th } from "@agency-os/ui";
import { createKam, renameKam, setKamUser, toggleKam } from "@/lib/kam-actions";

export interface KamManagerRow {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  userId: string | null;
}

export interface KamUserOption {
  id: string;
  name: string;
}

/** Modal en edición: null cerrado, "new" para crear, o la fila que se renombra. */
type Editing = null | "new" | KamManagerRow;

export function KamManager({
  kams,
  users = [],
  embedded = false,
}: {
  kams: KamManagerRow[];
  users?: KamUserOption[];
  embedded?: boolean;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const userName = (id: string | null) =>
    id ? (users.find((u) => u.id === id)?.name ?? "—") : null;

  const openModal = (target: Exclude<Editing, null>) => {
    setEditing(target);
    setName(target === "new" ? "" : target.name);
    setUserId(target === "new" ? "" : (target.userId ?? ""));
    setError(null);
  };

  const submit = () => {
    if (!editing) return;
    startTransition(async () => {
      const result =
        editing === "new"
          ? await createKam(name, userId || null)
          : await renameKam(editing.id, name);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Al renombrar una existente, actualizamos también el vínculo de usuario.
      if (editing !== "new") {
        const link = await setKamUser(editing.id, userId || null);
        if (link.error) {
          setError(link.error);
          return;
        }
      }
      setEditing(null);
    });
  };

  const toggle = (kam: KamManagerRow) => {
    startTransition(async () => {
      await toggleKam(kam.id, !kam.isActive);
    });
  };

  return (
    <div>
      <div
        className={`flex flex-wrap items-center gap-4 ${embedded ? "justify-end" : "justify-between"}`}
      >
        {!embedded && (
          <div>
            <h1 className="text-3xl font-bold tracking-tight">KAMs / PMs</h1>
            <p className="mt-1 text-sm text-muted">
              Responsables de cuenta disponibles en el formulario
            </p>
          </div>
        )}
        <Button onClick={() => openModal("new")}>+ Nuevo KAM/PM</Button>
      </div>

      <div className="mt-6">
        {kams.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-8 py-16 text-center">
            <div className="text-lg font-semibold">Todavía no hay KAMs/PMs</div>
            <p className="max-w-[44ch] text-sm text-muted">
              Crea la primera para poder asignarla en las cotizaciones.
            </p>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Usuario vinculado</Th>
                <Th>Estado</Th>
                <Th>Creado</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {kams.map((kam) => (
                <tr key={kam.id} className="transition hover:bg-surface-2">
                  <Td className="text-sm font-semibold">{kam.name}</Td>
                  <Td className="text-sm text-muted">
                    {userName(kam.userId) ?? <span className="text-faint">Sin vincular</span>}
                  </Td>
                  <Td>
                    <Badge tone={kam.isActive ? "success" : "neutral"}>
                      {kam.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(kam.createdAt)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openModal(kam)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => toggle(kam)}
                      >
                        {kam.isActive ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nuevo KAM/PM" : "Editar KAM/PM"}
        description="Aparecerá como responsable asignable en las cotizaciones."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !name.trim()}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <Label htmlFor="kam-name">Nombre</Label>
        <Input
          id="kam-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Nombre y apellido"
          autoFocus
        />
        <div className="mt-4">
          <Label htmlFor="kam-user">Usuario vinculado (para notificaciones)</Label>
          <Select id="kam-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Sin vincular</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
