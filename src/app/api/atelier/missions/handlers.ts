import { NextResponse } from "next/server";
import { atelierRoot, listMissions, loadMission, missionView, readArtifact } from "@/server/atelier/atelier-mission";

/** Read-only projection of local atelier missions (contract atelier-mission/v1, docs/atelier-contract.md). */
export function listAtelierMissions(root = atelierRoot()) {
  return NextResponse.json({ contract: "atelier-mission-list/v1", missions: listMissions(root).map(missionView) });
}
export function getAtelierMission(id: string, root = atelierRoot()) {
  try { return NextResponse.json(missionView(loadMission(id, root))); }
  catch { return NextResponse.json({ error: "Mission atelier introuvable." }, { status: 404 }); }
}
const TYPES: Record<string, string> = { ".png": "image/png", ".md": "text/markdown; charset=utf-8", ".diff": "text/x-diff; charset=utf-8", ".jsonl": "application/x-ndjson", ".log": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
export function getAtelierArtifact(id: string, artifactId: string, root = atelierRoot()) {
  try {
    const found = readArtifact(id, artifactId, root);
    if (!found) return NextResponse.json({ error: "Artefact introuvable." }, { status: 404 });
    const ext = found.artifact.path.slice(found.artifact.path.lastIndexOf("."));
    return new NextResponse(new Uint8Array(found.content), { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "x-artifact-sha256": found.artifact.sha256, "x-content-type-options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Mission atelier introuvable." }, { status: 404 }); }
}
