"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#080a16", color: "#fff", textAlign: "center" }}>
          <section style={{ maxWidth: 560 }}>
          <p style={{ color: "#fcd34d", fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase" }}>Oria HQ</p>
          <h1 style={{ fontSize: 32, fontWeight: 700 }}>Une erreur est survenue</h1>
          <p style={{ color: "#a3a3a3", fontSize: 14, lineHeight: 1.6 }}>
            La surface n’a pas pu être affichée. Réessayez sans relancer d’action sensible.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ minHeight: 44, borderRadius: 8, border: 0, background: "#f59e0b", color: "#0a0a0a", fontWeight: 700, padding: "0 16px" }}
          >
            Réessayer
          </button>
          </section>
        </main>
      </body>
    </html>
  );
}
