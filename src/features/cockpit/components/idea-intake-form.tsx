"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import {
  captureIdeaAction,
  type CaptureIdeaActionState,
} from "@/features/cockpit/events/idea-capture-action";

const initialCaptureIdeaActionState: CaptureIdeaActionState = {
  status: "idle",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-bold text-[#15110b] transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Plus className="h-4 w-4" aria-hidden="true" />
      )}
      Capturer
    </button>
  );
}

export function IdeaIntakeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(captureIdeaAction, initialCaptureIdeaActionState);

  useEffect(() => {
    if (state.status === "saved") {
      formRef.current?.reset();
    }
  }, [state.status, state.submittedAt]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6f7899]">
          Idée brute
        </span>
        <textarea
          name="rawText"
          required
          minLength={1}
          maxLength={4000}
          rows={6}
          placeholder="Capture l'idée telle quelle. Le titre sera dérivé de la première ligne."
          className="min-h-36 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-[13px] leading-6 text-[#eff1fb] outline-none transition placeholder:text-[#5d6688] focus:border-amber-400/60"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11.5px] leading-5 text-[#6f7899]">
          Écriture append-only dans <span className="font-semibold text-[#b8c0df]">events</span>.
          Aucune projection fictive.
        </p>
        <SubmitButton />
      </div>

      {state.status === "saved" ? (
        <p className="inline-flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2 text-xs leading-5 text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {state.message}
            {state.storageMode ? ` Source: ${state.storageMode}.` : null}
          </span>
        </p>
      ) : null}

      {state.status === "error" || state.status === "forbidden" ? (
        <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-3 py-2 text-xs leading-5 text-rose-100">
          <p className="inline-flex items-start gap-2 font-semibold">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {state.message ?? "Capture impossible."}
          </p>
          {state.errors?.length ? (
            <ul className="mt-1 list-inside list-disc pl-5 text-rose-100/85">
              {state.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
