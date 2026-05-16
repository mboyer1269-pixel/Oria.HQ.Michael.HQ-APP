"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send, ShieldCheck } from "lucide-react";
import type { ContactNotificationStatus } from "@/features/contact/types";

type ContactResponse = {
  ok?: boolean;
  message?: string;
  notificationStatus?: ContactNotificationStatus;
  error?: string;
};

export function ContactLeadForm() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      company: String(formData.get("company") ?? "").trim(),
      message: String(formData.get("message") ?? "").trim(),
      website: String(formData.get("website") ?? "").trim(),
      source: "suivia-contact-form",
    };

    if (!payload.name || !payload.email || payload.message.length < 10) {
      setError("Il manque ton nom, ton courriel ou un message d'au moins 10 caractères.");
      setSuccess(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ContactResponse;

      if (!response.ok) {
        throw new Error(data.error ?? `Contact API ${response.status}`);
      }

      setSuccess(data.message ?? "Merci, ton message a bien été reçu. On te revient sous 24-48h.");
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer la demande pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      data-testid="contact-lead-form"
      className="rounded-3xl border border-emerald-500/20 bg-neutral-950/85 p-4 shadow-2xl shadow-emerald-950/10 md:p-6"
    >
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">Contact Oria</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Parle-nous du workspace ou du mode métier.</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Une demande claire, un suivi humain, et les infos restent traitées côté serveur.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Réponse en 24-48h
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-neutral-200">
            Nom
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              className="min-h-12 w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 text-white outline-none transition placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
              placeholder="Ton nom"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-neutral-200">
            Courriel
            <input
              name="email"
              required
              type="email"
              maxLength={254}
              autoComplete="email"
              className="min-h-12 w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 text-white outline-none transition placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
              placeholder="toi@entreprise.com"
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-neutral-200">
            Téléphone <span className="text-neutral-500">(optionnel)</span>
            <input
              name="phone"
              maxLength={40}
              autoComplete="tel"
              className="min-h-12 w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 text-white outline-none transition placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
              placeholder="+1 514 ..."
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-neutral-200">
            Entreprise <span className="text-neutral-500">(optionnel)</span>
            <input
              name="company"
              maxLength={160}
              autoComplete="organization"
              className="min-h-12 w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 text-white outline-none transition placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
              placeholder="Nom de l'entreprise"
            />
          </label>
        </div>

        <label className="space-y-2 text-sm font-medium text-neutral-200">
          Message
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={4000}
            rows={5}
            className="w-full resize-none rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-white outline-none transition placeholder:text-neutral-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
            placeholder="Explique le besoin: assistant personnel, conseiller financier, immobilier ou autre métier."
          />
        </label>

        <div className="hidden" aria-hidden="true">
          <label>
            Site web
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs leading-5 text-neutral-500">Confidentiel · Aucun spam · Suivi humain</p>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 font-semibold text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 md:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {loading ? "Envoi en cours..." : "Envoyer la demande"}
          </button>
        </div>
      </form>

      {success && (
        <div
          className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium text-emerald-100">Demande reçue.</p>
            <p className="mt-1 leading-6">{success}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium text-red-100">La demande n&apos;est pas partie.</p>
            <p className="mt-1 leading-6">{error}</p>
          </div>
        </div>
      )}
    </section>
  );
}
