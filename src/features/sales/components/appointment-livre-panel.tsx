"use client";

// Livre de RDV panel — schedule slots + prepare confirmation SMS.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ClipboardCopy, Loader2, Plus, RefreshCw } from "lucide-react";
import type { LivreDay, SalesAppointment } from "@/features/sales/appointment-book";
import {
  formatAppointmentSlotFr,
  purposeLabelFr,
} from "@/features/sales/appointment-book";
import type { SalesLead } from "@/features/sales/sales-lead";

type Props = {
  leads: SalesLead[];
  initialLivre: LivreDay[];
  onFlashCopy: (key: string, text: string) => Promise<void>;
  copiedId: string | null;
};

export function AppointmentLivrePanel({
  leads,
  initialLivre,
  onFlashCopy,
  copiedId,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const activeLeads = leads.filter((l) => l.stage !== "sold" && l.stage !== "lost");
  const [livre, setLivre] = useState<LivreDay[]>(initialLivre);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(true);
  const [smsDraft, setSmsDraft] = useState<{ to: string; body: string } | null>(null);
  const [leadId, setLeadId] = useState(activeLeads[0]?.leadId ?? "");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [purpose, setPurpose] = useState("test_drive");
  const [notes, setNotes] = useState("");

  const resolvedLeadId = leadId || activeLeads[0]?.leadId || "";

  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch("/api/sales/appointments");
      const payload = await res.json().catch(() => null);
      if (res.ok && Array.isArray(payload?.livre)) {
        setLivre(payload.livre as LivreDay[]);
        setOk(true);
        setMsg("Livre rafraîchi.");
      } else {
        setOk(false);
        setMsg("Impossible de recharger le livre.");
      }
    } catch (err) {
      setOk(false);
      setMsg(err instanceof Error ? err.message : "Refresh échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    if (!resolvedLeadId || !startsAtLocal) {
      setOk(false);
      setMsg("Choisis un lead et un créneau.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const startsAt = new Date(startsAtLocal).toISOString();
      const res = await fetch("/api/sales/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: resolvedLeadId,
          startsAt,
          purpose,
          notes,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setOk(false);
        setMsg(payload?.errors?.join("; ") ?? "Ajout au livre échoué.");
        return;
      }
      setOk(true);
      setMsg("Créneau ajouté au livre. Prépare le SMS confirm.");
      const livreRes = await fetch("/api/sales/appointments");
      const livrePayload = await livreRes.json().catch(() => null);
      if (livreRes.ok && Array.isArray(livrePayload?.livre)) {
        setLivre(livrePayload.livre as LivreDay[]);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setOk(false);
      setMsg(err instanceof Error ? err.message : "Ajout échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareSms(appointment: SalesAppointment, kind: "invite" | "confirm" | "reminder") {
    setBusy(true);
    try {
      const res = await fetch("/api/sales/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare_sms",
          appointmentId: appointment.appointmentId,
          kind,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.draft) {
        setOk(false);
        setMsg(payload?.errors?.join("; ") ?? "Préparation SMS échouée.");
        return;
      }
      setSmsDraft({ to: payload.draft.to as string, body: payload.draft.body as string });
      setOk(true);
      setMsg(`SMS ${kind} prêt — copie dans Messages.`);
    } catch (err) {
      setOk(false);
      setMsg(err instanceof Error ? err.message : "SMS échoué.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
          <BookOpen className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold tracking-tight text-white">Livre de RDV</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-400">
            Remplis ton livre (essais / visites). Oria prépare les SMS — toi tu confirmes et tu
            envoies.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:border-amber-500/40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Rafraîchir
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300/80">
            Ajouter un créneau
          </p>
          <label className="mt-2 block text-[11px] text-neutral-500">
            Lead
            <select
              value={resolvedLeadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-sm text-white"
            >
              {activeLeads.length === 0 ? (
                <option value="">Aucun lead actif</option>
              ) : (
                activeLeads.map((l) => (
                  <option key={l.leadId} value={l.leadId}>
                    {l.fullName}
                    {l.interestedModels[0] ? ` · ${l.interestedModels[0]}` : ""}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="mt-2 block text-[11px] text-neutral-500">
            Créneau
            <input
              type="datetime-local"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-sm text-white"
            />
          </label>
          <label className="mt-2 block text-[11px] text-neutral-500">
            Type
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-sm text-white"
            >
              <option value="test_drive">Essai routier</option>
              <option value="showroom">Visite salle</option>
              <option value="trade_appraisal">Évaluation échange</option>
              <option value="finance">Financement</option>
              <option value="delivery">Livraison</option>
              <option value="other">Autre</option>
            </select>
          </label>
          <label className="mt-2 block text-[11px] text-neutral-500">
            Notes
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-sm text-white"
              placeholder="Optionnel"
            />
          </label>
          <button
            type="button"
            disabled={busy || !resolvedLeadId}
            onClick={() => void schedule()}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 text-sm font-bold text-neutral-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Mettre dans le livre
          </button>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300/80">
            Semaine (America/Toronto)
          </p>
          {livre.every((d) => d.appointments.length === 0) ? (
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Livre vide. Objectif adjoint : 3–5 essais planifiés cette semaine.
            </p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
              {livre.map((day) =>
                day.appointments.map((a) => (
                  <li
                    key={a.appointmentId}
                    className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5"
                  >
                    <p className="text-xs font-semibold text-white">
                      {formatAppointmentSlotFr(a.startsAt)} · {a.fullName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      {purposeLabelFr(a.purpose)}
                      {a.vehicleHint ? ` · ${a.vehicleHint}` : ""} · {a.status}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(["invite", "confirm", "reminder"] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          disabled={busy}
                          onClick={() => void prepareSms(a, kind)}
                          className="rounded-md border border-neutral-700 px-2 py-1 text-[10px] font-semibold text-neutral-300 hover:border-amber-500/40 hover:text-amber-200"
                        >
                          SMS {kind}
                        </button>
                      ))}
                    </div>
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
      </div>

      {smsDraft ? (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Draft SMS → {smsDraft.to}
          </p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-neutral-200">
            {smsDraft.body}
          </pre>
          <button
            type="button"
            onClick={() => void onFlashCopy("livre-sms", smsDraft.body)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:border-amber-500/40 hover:text-amber-200"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            {copiedId === "livre-sms" ? "Copié" : "Copier"}
          </button>
        </div>
      ) : null}

      {msg ? (
        <p className={`mt-3 text-xs ${ok ? "text-emerald-300" : "text-rose-300"}`}>{msg}</p>
      ) : null}
    </section>
  );
}
