import { buildCeoBriefSnapshot } from "@/server/brief/ceo-brief-service";
import { CeoBriefPanel } from "@/features/hq/components/ceo-brief-panel";

export async function CeoBriefSection() {
  const brief = await buildCeoBriefSnapshot();

  return <CeoBriefPanel brief={brief} />;
}
