"use client";

import { useMemo, useState, useTransition } from "react";
import { groupPermissions } from "@agency-os/domain";
import { Badge, Button, Input, Label, Modal, Select } from "@agency-os/ui";
import {
  createRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
  updateRoleAction,
} from "@/lib/roles-actions";

export interface RolesManagerRole {
  id: string;
  name: string;
  moduleCode: string | null;
  isSuper: boolean;
}

export interface RolesManagerPermission {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface RolesManagerModule {
  code: string;
  name: string;
}

interface RolesManagerProps {
  roles: RolesManagerRole[];
  permissions: RolesManagerPermission[];
  /** permission ids actuales por rol, ej. { "<roleId>": ["<permId>", ...] } */
  rolePermissionsByRole: Record<string, string[]>;
  modules: RolesManagerModule[];
}

interface RoleFormState {
  name: string;
  moduleCode: string;
  isSuper: boolean;
}

function emptyForm(): RoleFormState {
  return { name: "", moduleCode: "", isSuper: false };
}

export function RolesManager({
  roles,
  permissions,
  rolePermissionsByRole,
  modules,
}: RolesManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const [form, setForm] = useState<RoleFormState>(() => {
    const first = roles[0];
    return first
      ? { name: first.name, moduleCode: first.moduleCode ?? "", isSuper: first.isSuper }
      : emptyForm();
  });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(roles[0] ? (rolePermissionsByRole[roles[0].id] ?? []) : []),
  );
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<RoleFormState>(emptyForm());
  const [deleting, setDeleting] = useState<RolesManagerRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;
  const groups = useMemo(() => groupPermissions(permissions), [permissions]);

  const selectRole = (role: RolesManagerRole) => {
    setSelectedId(role.id);
    setForm({ name: role.name, moduleCode: role.moduleCode ?? "", isSuper: role.isSuper });
    setCheckedIds(new Set(rolePermissionsByRole[role.id] ?? []));
    setError(null);
  };

  const togglePermission = (permissionId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const saveChanges = () => {
    if (!selectedRole) return;
    setError(null);
    startTransition(async () => {
      const input = {
        name: form.name,
        moduleCode: form.moduleCode || null,
        isSuper: form.isSuper,
      };
      const updateResult = await updateRoleAction(selectedRole.id, input);
      if (updateResult.error) {
        setError(updateResult.error);
        return;
      }
      const permsResult = await setRolePermissionsAction(selectedRole.id, [...checkedIds]);
      if (permsResult.error) {
        setError(permsResult.error);
      }
    });
  };

  const openCreate = () => {
    setCreateForm(emptyForm());
    setError(null);
    setCreating(true);
  };

  const submitCreate = () => {
    if (!createForm.name.trim()) return;
    startTransition(async () => {
      const result = await createRoleAction({
        name: createForm.name,
        moduleCode: createForm.moduleCode || null,
        isSuper: createForm.isSuper,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreating(false);
    });
  };

  const submitDelete = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteRoleAction(deleting.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (selectedId === deleting.id) setSelectedId(null);
      setDeleting(null);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <div>
        <Button onClick={openCreate} className="mb-3 w-full">
          + Nuevo rol
        </Button>
        <div className="space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => selectRole(role)}
              className={`flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-sm transition ${
                role.id === selectedId ? "bg-surface-2 font-semibold" : "hover:bg-surface-2/60"
              }`}
            >
              <span>{role.name}</span>
              <span className="flex gap-1">
                {role.isSuper && <Badge tone="warn">Super</Badge>}
                {role.moduleCode && <Badge tone="neutral">{role.moduleCode}</Badge>}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
        {!selectedRole ? (
          <p className="text-sm text-muted">Selecciona un rol para editarlo.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="role-name">Nombre</Label>
                <Input
                  id="role-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="role-module">Módulo</Label>
                <Select
                  id="role-module"
                  value={form.moduleCode}
                  onChange={(e) => setForm((f) => ({ ...f, moduleCode: e.target.value }))}
                >
                  <option value="">Sistema</option>
                  {modules.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line-strong"
                    checked={form.isSuper}
                    onChange={(e) => setForm((f) => ({ ...f, isSuper: e.target.checked }))}
                  />
                  Superadmin (`is_super`)
                </label>
                {form.isSuper && (
                  <p className="mt-1 text-xs text-danger">
                    Este rol se salta todos los chequeos de permiso.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-5">
              {groups.map((group) => (
                <div key={group.label}>
                  <h3 className="text-sm font-bold tracking-tight">{group.label}</h3>
                  <div className="mt-2 space-y-2">
                    {group.items.map((permission) => (
                      <label key={permission.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-line-strong"
                          checked={checkedIds.has(permission.id)}
                          onChange={() => togglePermission(permission.id)}
                        />
                        <span>
                          <span className="font-medium">{permission.name}</span>
                          {permission.description && (
                            <span className="block text-xs text-muted">
                              {permission.description}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}

            <div className="mt-6 flex justify-between">
              <Button variant="danger" onClick={() => setDeleting(selectedRole)}>
                Eliminar rol
              </Button>
              <Button onClick={saveChanges} disabled={pending || !form.name.trim()}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </>
        )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nuevo rol"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={pending || !createForm.name.trim()}>
              {pending ? "Creando…" : "Crear"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-role-name">Nombre</Label>
            <Input
              id="new-role-name"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej. Editor de contenido"
            />
          </div>
          <div>
            <Label htmlFor="new-role-module">Módulo</Label>
            <Select
              id="new-role-module"
              value={createForm.moduleCode}
              onChange={(e) => setCreateForm((f) => ({ ...f, moduleCode: e.target.value }))}
            >
              <option value="">Sistema</option>
              {modules.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line-strong"
              checked={createForm.isSuper}
              onChange={(e) => setCreateForm((f) => ({ ...f, isSuper: e.target.checked }))}
            />
            Superadmin (`is_super`)
          </label>
        </div>
        {error && creating && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Eliminar rol"
        description={
          deleting
            ? `Se eliminará el rol "${deleting.name}". Esta acción no se puede deshacer.`
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
        {error && deleting && <p className="text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
