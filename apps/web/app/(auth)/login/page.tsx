"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { login, type AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Ingresando..." : "Entrar"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#f6f6f7]">
          Bienvenido de nuevo
        </h1>
        <p className="mt-1 text-[13.5px] text-[#a1a1aa]">Entra a tu workspace.</p>
      </div>

      <div>
        <Label htmlFor="email" className="text-[#f6f6f7]">
          Email
        </Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div>
        <Label htmlFor="password" className="text-[#f6f6f7]">
          Contraseña
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      <FieldError>{state.error}</FieldError>

      <SubmitButton />

      <a
        href="/reset-password"
        className="block text-center text-[12.5px] text-[#71717a] transition hover:text-[#b8ff3c]"
      >
        ¿Olvidaste tu contraseña?
      </a>
    </form>
  );
}
