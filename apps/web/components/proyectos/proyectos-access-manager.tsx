"use client";

// Página de accesos propia de Proyectos: asigna/revoca SOLO los roles del
// módulo (proyectos_admin, proyectos_colaborador). No invita ni elimina
// usuarios — eso sigue siendo exclusivo de /usuarios.

import { useState, useTransition } from "react";
import { Badge, Button, Label, Modal, Select, Table, Td, Th } from "@agency-os/ui";
import { grantProjectRole, revokeProjectRole } from "@/lib/proyectos-access-actions";

export interface ProyectosAccessUserRow {
  id: string;
  fullName: string;
  email: string | null;
  /** Roles de Proyectos ya asignados a este usuario (0, 1 o los 2). */
  projectRoles: { userRoleId: string; roleName: string }[];
}

export interface ProyectosRoleOption {
  id: string;
  name: string;
}

interface ProyectosAccessManagerProps {
  users: ProyectosAccessUserRow[];
  roles: ProyectosRoleOption[];
}

export function ProyectosAccessManager({ users, roles }: ProyectosAccessManagerProps) {
  const [assigning, setAssigning] = useState<ProyectosAccessUserRow | null>(null);
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openAssign = (user: ProyectosAccessUserRow) => {
    setAssigning(user);
    setRoleId("");
    setError(null);
  };

  const submitAssign = () => {
    if (!assigning || !roleId) return;
    startTransition(async () => {
      const result = await grantProjectRole(assigning.id, roleId);
      if (result.error) setError(result.error);
      else setAssigning(null);
    });
  };

  const revoke = (userRoleId: string) => {
    startTransition(async () => {
      await revokeProjectRole(userRoleId);
    });
  };

  return (
    <div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accesos de Proyectos</h1>
        <p className="mt-1 text-sm text-muted">
          Da o quita el acceso al módulo Proyectos, sin tocar el resto de accesos del sistema.
        </p>
      </div>

      <div className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th>Usuario</Th>
              <Th>Rol de Proyectos</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="transition hover:bg-surface-2">
                <Td>
                  <div className="text-sm font-semibold">{user.fullName}</div>
                  {user.email && <div className="text-xs text-muted">{user.email}</div>}
                </Td>
                <Td>
                  {user.projectRoles.length === 0 ? (
                    <Badge tone="neutral">Sin acceso a Proyectos</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {user.projectRoles.map((r) => (
                        <span
                          key={r.userRoleId}
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line-strong px-2.5 py-1 text-xs"
                        >
                          <span className="font-semibold">{r.roleName}</span>
                          <button
                            type="button"
                            aria-label={`Revocar ${r.roleName}`}
                            disabled={pending}
                            onClick={() => revoke(r.userRoleId)}
                            className="cursor-pointer text-muted transition hover:text-danger"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </Td>
                <Td className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openAssign(user)}>
                    Asignar rol
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Asignar rol de Proyectos"
        description={assigning ? `Da acceso a ${assigning.fullName}.` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancelar
            </Button>
            <Button onClick={submitAssign} disabled={pending || !roleId}>
              {pending ? "Asignando…" : "Asignar"}
            </Button>
          </>
        }
      >
        <Label htmlFor="assign-project-role">Rol</Label>
        <Select id="assign-project-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Selecciona un rol…</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
        {error && assigning && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
