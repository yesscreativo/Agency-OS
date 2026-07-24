"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { login, type AuthActionState } from "@/lib/auth-actions";
import { GoogleButton } from "@/components/auth/google-button";

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
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction] = useFormState(login, initialState);
  const searchParams = useSearchParams();
  const domainError = searchParams.get("error") === "dominio";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#f6f6f7]">
          Bienvenido de nuevo
        </h1>
        <p className="mt-1 text-[13.5px] text-[#a1a1aa]">Entra a tu workspace.</p>
      </div>

      {domainError && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">
          Solo se permite acceso con correos @laburuagencia.com.
        </p>
      )}

      <GoogleButton />

      <div className="flex items-center gap-3 text-[12.5px] text-[#71717a]">
        <span className="h-px flex-1 bg-white/10" />
        o con tu correo
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form action={formAction} className="space-y-4">
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
    </div>
  );
}
