import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContactLeadForm } from "@/features/contact/components/contact-lead-form";

export const metadata: Metadata = {
  title: "Contact | Oria",
  description: "Envoie-nous un message. Réponse humaine en 24-48h.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-4 py-10 md:px-8 md:py-16">
      <nav>
        <Link
          href={"/" as Route}
          className="inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l&apos;accueil
        </Link>
      </nav>

      <ContactLeadForm />
    </main>
  );
}
