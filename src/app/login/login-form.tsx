"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { signInAction, type LoginFormState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-neutral-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
      {pending ? "Connexion en cours..." : "Entrer dans Michael HQ"}
    </button>
  );
}

export function LoginForm({ initialState }: { initialState: LoginFormState }) {
  const [state, formAction] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="nextPath" value={state.nextPath} />

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-semibold text-neutral-200">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          className="min-h-12 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 text-white outline-none transition placeholder:text-neutral-600 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10"
          placeholder="ton@email.com"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-semibold text-neutral-200">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-12 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 text-white outline-none transition placeholder:text-neutral-600 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10"
          placeholder="Ton mot de passe"
        />
      </div>

      {state.error ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold text-red-100">Connexion impossible.</p>
            <p className="mt-1 leading-6">{state.error}</p>
          </div>
        </div>
      ) : null}

      <SubmitButton />

      <p className="text-center text-xs leading-5 text-neutral-500">
        Accès réservé au workspace privé. Aucun accès public n&apos;est offert ici.
      </p>
    </form>
  );
}
