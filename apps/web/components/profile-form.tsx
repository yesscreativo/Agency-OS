"use client";

import { useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Avatar, Button, FieldError, Input, Label } from "@agency-os/ui";
import { initialsOf } from "@agency-os/domain";
import { updatePassword, type AuthActionState } from "@/lib/auth-actions";
import { removeMyAvatar, updateMyProfile, uploadMyAvatar } from "@/lib/profile-actions";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function SubmitPasswordButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? "Guardando…" : "Cambiar contraseña"}
    </Button>
  );
}

const initialPasswordState: AuthActionState = { error: null };

export function ProfileForm({
  initialName,
  email,
  initialAvatarUrl = null,
}: {
  initialName: string;
  email: string;
  initialAvatarUrl?: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [passwordState, passwordAction] = useFormState(updatePassword, initialPasswordState);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarPending, startAvatarTransition] = useTransition();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const saveName = () => {
    setSaved(false);
    setNameError(null);
    startTransition(async () => {
      const result = await updateMyProfile(name);
      if (result.error) setNameError(result.error);
      else setSaved(true);
    });
  };

  const onAvatarFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setAvatarError(null);
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("La imagen supera el límite de 2 MB.");
      return;
    }
    startAvatarTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadMyAvatar(fd);
      if (res.error) setAvatarError(res.error);
      else setAvatarUrl(res.avatarUrl ?? null);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    });
  };

  const onAvatarRemove = () => {
    setAvatarError(null);
    startAvatarTransition(async () => {
      const res = await removeMyAvatar();
      if (res.error) setAvatarError(res.error);
      else setAvatarUrl(null);
    });
  };

  return (
    <div className="max-w-[480px] space-y-8">
      <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
        <h2 className="text-lg font-bold tracking-tight">Foto</h2>
        <div className="mt-4 flex items-center gap-4">
          <Avatar initials={initialsOf(name)} src={avatarUrl} tone="purple" size="lg" />
          <div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onAvatarFile(e.target.files)}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarPending}
              >
                {avatarPending ? "Subiendo…" : avatarUrl ? "Cambiar foto" : "Subir foto"}
              </Button>
              {avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={onAvatarRemove}
                  disabled={avatarPending}
                >
                  Quitar
                </Button>
              )}
            </div>
            {avatarError && <p className="mt-1 text-sm text-danger">{avatarError}</p>}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
        <h2 className="text-lg font-bold tracking-tight">Datos personales</h2>
        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="profile-email">Correo</Label>
            <Input id="profile-email" value={email} disabled />
          </div>
          <div>
            <Label htmlFor="profile-name">Nombre completo</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
            <FieldError>{nameError}</FieldError>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveName} disabled={pending || !name.trim()}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            {saved && <span className="text-sm text-green">Guardado.</span>}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
        <h2 className="text-lg font-bold tracking-tight">Contraseña</h2>
        <form action={passwordAction} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="password">Contraseña nueva</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <FieldError>{passwordState.error}</FieldError>
          <SubmitPasswordButton />
        </form>
      </section>
    </div>
  );
}
