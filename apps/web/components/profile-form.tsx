"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { updatePassword, type AuthActionState } from "@/lib/auth-actions";
import { updateMyProfile } from "@/lib/profile-actions";

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
}: {
  initialName: string;
  email: string;
}) {
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [passwordState, passwordAction] = useFormState(updatePassword, initialPasswordState);

  const saveName = () => {
    setSaved(false);
    setNameError(null);
    startTransition(async () => {
      const result = await updateMyProfile(name);
      if (result.error) setNameError(result.error);
      else setSaved(true);
    });
  };

  return (
    <div className="max-w-[480px] space-y-8">
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
