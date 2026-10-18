"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type ActionResult } from "../actions";
import { Field, Spinner, btnPrimary, inputCls } from "@/components/ui";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<ActionResult | null, FormData>(signIn, null);
  const [upState, upAction, upPending] = useActionState<ActionResult<{ needsConfirmation: boolean }> | null, FormData>(signUp, null);
  const state = mode === "in" ? inState : upState;
  const pending = mode === "in" ? inPending : upPending;

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">A Minha Coleção</h1>
        <p className="mt-1 text-sm text-muted">{mode === "in" ? "Inicie sessão para aceder às suas cartas." : "Crie a sua conta privada."}</p>

        <form action={mode === "in" ? inAction : upAction} className="mt-5 space-y-4" noValidate>
          <Field label="Email" htmlFor="email">
            <input id="email" name="email" type="email" autoComplete="email" required className={inputCls} />
          </Field>
          <Field label="Palavra-passe" htmlFor="password" hint={mode === "up" ? "Pelo menos 8 caracteres." : undefined}>
            <input id="password" name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={mode === "up" ? 8 : undefined} className={inputCls} />
          </Field>

          {state && !state.ok && (
            <p role="alert" className="rounded-lg bg-[#fbeceb] px-3 py-2 text-sm text-neg">
              {state.error}
            </p>
          )}
          {mode === "up" && upState?.ok && (
            <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              Conta criada. Confirme o seu email (se pedido) e depois inicie sessão.
            </p>
          )}

          <button className={`${btnPrimary} w-full`} disabled={pending}>
            {pending && <Spinner />}
            {mode === "in" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button className="mt-4 text-sm text-accent underline-offset-2 hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Ainda não tenho conta" : "Já tenho conta"}
        </button>
      </div>
    </main>
  );
}
