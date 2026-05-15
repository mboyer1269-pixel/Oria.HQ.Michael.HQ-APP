import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { buildCeoBriefSnapshot } from "@/server/brief/ceo-brief-service";
import { CalendarRepositoryError } from "@/server/calendar/calendar-repository";
import { ContactLeadRepositoryError } from "@/server/contact/contact-lead-repository";

export async function GET() {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  try {
    const brief = await buildCeoBriefSnapshot();

    return NextResponse.json({ brief });
  } catch (error) {
    if (error instanceof CalendarRepositoryError || error instanceof ContactLeadRepositoryError) {
      return NextResponse.json(
        {
          error: "Le CEO Brief n'est pas disponible pour le moment.",
          code: error.code,
        },
        { status: 503 },
      );
    }

    console.error("CEO Brief failed:", error instanceof Error ? error.message : "Unknown error");

    return NextResponse.json(
      {
        error: "Le CEO Brief a eu un problème serveur.",
      },
      { status: 500 },
    );
  }
}
