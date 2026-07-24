"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Button, Input, Label, Modal, Select, Table, Td, Th } from "@agency-os/ui";
import { deleteUser, grantRole, inviteUser, revokeRole } from "@/lib/access-actions";

export interface AccessUserRow {
  id: string;
  fullName: string;
  email: string | null;
  roles: { userRoleId: string; roleCode: string; roleName: string; moduleCode: string | null }[];
}

export interface AccessRole {
  id: string;
  name: string;
  moduleCode: string | null;
}

export interface AccessModule {
  code: string;
  name: string;
}

interface AccessManagerProps {
  users: AccessUserRow[];
  roles: AccessRole[];
  modules: AccessModule[];
  /** id del usuario en sesión, para no permitir auto-eliminarse. */
  currentUserId: string;
}

function moduleLabel(modules: AccessModule[], code: string | null): string {
  if (!code) return "Sistema";
  return modules.find((m) => m.code === code)?.name ?? code;
}

export function AccessManager({ users, roles, modules, currentUserId }: AccessManagerProps) {
  const [inviting, setInviting] = useState(false);
  const [assigning, setAssigning] = useState<AccessUserRow | null>(null);
  const [deleting, setDeleting] = useState<AccessUserRow | null>(null);
  const [roleId, setRoleId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Roles agrupados por módulo (o "Sistema" para is_super) para el <select> (optgroups).
  const rolesByModule = useMemo(() => {
    const groups = new Map<string | null, AccessRole[]>();
    for (const role of roles) {
      const list = groups.get(role.moduleCode) ?? [];
      list.push(role);
      groups.set(role.moduleCode, list);
    }
    return [...groups.entries()];
  }, [roles]);

  const openAssign = (user: AccessUserRow) => {
    setAssigning(user);
    setRoleId("");
    setError(null);
  };

  const submitAssign = () => {
    if (!assigning || !roleId) return;
    startTransition(async () => {
      const result = await grantRole(assigning.id, roleId);
      if (result.error) setError(result.error);
      else setAssigning(null);
    });
  };

  const revoke = (userRoleId: string) => {
    startTransition(async () => {
      await revokeRole(userRoleId);
    });
  };

  const openDelete = (user: AccessUserRow) => {
    setDeleting(user);
    setError(null);
  };

  const submitDelete = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteUser(deleting.id);
      if (result.error) setError(result.error);
      else setDeleting(null);
    });
  };

  const openInvite = () => {
    setInviting(true);
    setInviteEmail("");
    setInviteName("");
    setError(null);
  };

  const submitInvite = () => {
    if (!inviteEmail.trim()) return;
    startTransition(async () => {
      const result = await inviteUser(inviteEmail, inviteName);
      if (result.error) setError(result.error);
      else setInviting(false);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="mt-1 text-sm text-muted">
            Gestiona quién entra a cada módulo y con qué rol.
          </p>
        </div>
        <Button onClick={openInvite}>+ Invitar usuario</Button>
      </div>

      <div className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th>Usuario</Th>
              <Th>Accesos</Th>
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
                  {user.roles.length === 0 ? (
                    <Badge tone="neutral">Pendiente</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {user.roles.map((r) => (
                        <span
                          key={r.userRoleId}
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line-strong px-2.5 py-1 text-xs"
                        >
                          <span className="text-muted">
                            {moduleLabel(modules, r.moduleCode)} ·
                          </span>
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
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openAssign(user)}>
                      Asignar rol
                    </Button>
                    {user.id !== currentUserId && (
                      <Button variant="danger" size="sm" onClick={() => openDelete(user)}>
                        Eliminar
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Asignar rol"
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
        <Label htmlFor="assign-role">Rol</Label>
        <Select id="assign-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Selecciona un rol…</option>
          {rolesByModule.map(([moduleCode, group]) => (
            <optgroup key={moduleCode ?? "sistema"} label={moduleLabel(modules, moduleCode)}>
              {group.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        {error && assigning && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Eliminar usuario"
        description={
          deleting
            ? `Se eliminará la cuenta de ${deleting.fullName} y todos sus accesos. Esta acción no se puede deshacer.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={submitDelete} disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar"}
            </Button>
          </>
        }
      >
        {deleting?.email && (
          <p className="text-sm text-muted">
            Correo: <span className="text-ink">{deleting.email}</span>
          </p>
        )}
        {error && deleting && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invitar usuario"
        description="Solo se permiten correos @laburuagencia.com. Recibirá un enlace para entrar."
        footer={
          <>
            <Button variant="outline" onClick={() => setInviting(false)}>
              Cancelar
            </Button>
            <Button onClick={submitInvite} disabled={pending || !inviteEmail.trim()}>
              {pending ? "Invitando…" : "Invitar"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="invite-name">Nombre</Label>
            <Input
              id="invite-name"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Nombre y apellido"
            />
          </div>
          <div>
            <Label htmlFor="invite-email">Correo</Label>
            <Input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="nombre@laburuagencia.com"
            />
          </div>
        </div>
        {error && inviting && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
