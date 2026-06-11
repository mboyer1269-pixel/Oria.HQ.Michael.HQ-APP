"use client";

// CEO Notes — two-pane workspace: note list (left) + editor with autosave
// (right). Autosave debounced 800 ms; explicit status indicator. Archive is
// soft (history preserved server-side).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  Loader2,
  Pin,
  PinOff,
  Plus,
  StickyNote,
} from "lucide-react";
import type { CeoNote } from "@/server/notes/note-repository";
import { archiveNoteAction, listNotesAction, saveNoteAction } from "../note-action";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function NotesWorkspace() {
  const [notes, setNotes] = useState<CeoNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    listNotesAction().then((result) => {
      if (result.status === "ok") {
        setNotes(result.notes);
        if (result.notes.length > 0) {
          setSelectedId(result.notes[0].id);
          setTitle(result.notes[0].title);
          setBody(result.notes[0].body);
        }
      }
      setLoaded(true);
    });
  }, []);

  const persist = useCallback(async (id: string | null, nextTitle: string, nextBody: string) => {
    if (!nextTitle.trim() && !nextBody.trim()) return;
    setSaveStatus("saving");
    const result = await saveNoteAction({
      ...(id ? { id } : {}),
      title: nextTitle.trim() || "Sans titre",
      body: nextBody,
    });
    if (result.status === "saved") {
      setSaveStatus("saved");
      setNotes((current) => {
        const without = current.filter((note) => note.id !== result.note.id);
        return [result.note, ...without];
      });
      if (!id && selectedIdRef.current === null) {
        setSelectedId(result.note.id);
      }
    } else {
      setSaveStatus("error");
    }
  }, []);

  function scheduleSave(nextTitle: string, nextBody: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist(selectedIdRef.current, nextTitle, nextBody);
    }, 800);
  }

  function select(note: CeoNote) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSelectedId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setSaveStatus("idle");
  }

  function createNew() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSelectedId(null);
    setTitle("");
    setBody("");
    setSaveStatus("idle");
  }

  async function togglePin(note: CeoNote) {
    const result = await saveNoteAction({
      id: note.id,
      title: note.title,
      body: note.body,
      pinned: !note.pinned,
    });
    if (result.status === "saved") {
      setNotes((current) =>
        current
          .map((item) => (item.id === result.note.id ? result.note : item))
          .sort(
            (a, b) =>
              Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
          ),
      );
    }
  }

  async function archive(note: CeoNote) {
    const result = await archiveNoteAction({ id: note.id, archived: true });
    if (result.status === "saved") {
      setNotes((current) => current.filter((item) => item.id !== note.id));
      if (selectedIdRef.current === note.id) createNew();
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
      <aside className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto rounded-2xl border border-white/[0.07] bg-black/25 p-3">
        <button
          type="button"
          onClick={createNew}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouvelle note
        </button>
        {!loaded ? (
          <p className="px-2 py-4 text-xs text-neutral-600">Chargement…</p>
        ) : notes.length === 0 ? (
          <p className="px-2 py-4 text-xs text-neutral-600">
            Aucune note. Écris à droite — l&apos;enregistrement est automatique.
          </p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={`group relative rounded-xl border px-3 py-2 transition ${
                selectedId === note.id
                  ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                  : "border-white/[0.05] bg-white/[0.02] hover:border-white/15"
              }`}
            >
              <button type="button" onClick={() => select(note)} className="block w-full text-left">
                <p className="flex items-center gap-1.5 truncate text-xs font-bold text-neutral-200">
                  {note.pinned ? <Pin className="h-3 w-3 shrink-0 text-amber-400" /> : null}
                  {note.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                  {note.body.replace(/\n/g, " ").slice(0, 60) || "…"}
                </p>
                <p className="mt-1 text-[10px] text-neutral-600">
                  {new Date(note.updatedAt).toLocaleString("fr-CA", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </button>
              <div className="absolute right-2 top-2 hidden items-center gap-1 group-hover:flex">
                <button
                  type="button"
                  onClick={() => togglePin(note)}
                  title={note.pinned ? "Désépingler" : "Épingler"}
                  className="rounded-md p-1 text-neutral-500 hover:text-amber-400"
                >
                  {note.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => archive(note)}
                  title="Archiver"
                  className="rounded-md p-1 text-neutral-500 hover:text-rose-400"
                >
                  <Archive className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </aside>

      <section className="flex flex-col rounded-2xl border border-white/[0.07] bg-black/25 p-4">
        <div className="flex items-center justify-between gap-3">
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              scheduleSave(event.target.value, body);
            }}
            placeholder="Titre de la note…"
            className="w-full bg-transparent text-lg font-bold text-white outline-none placeholder:text-neutral-600"
          />
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-neutral-500">
            {saveStatus === "saving" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
              </>
            ) : saveStatus === "saved" ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" /> Enregistré
              </>
            ) : saveStatus === "error" ? (
              <span className="text-rose-400">Erreur — réessaie</span>
            ) : (
              <>
                <StickyNote className="h-3 w-3" /> Autosave actif
              </>
            )}
          </span>
        </div>
        <textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            scheduleSave(title, event.target.value);
          }}
          placeholder={"Capture l'idée maintenant, structure plus tard.\nTout est enregistré automatiquement."}
          className="mt-3 min-h-[50vh] w-full flex-1 resize-none bg-transparent text-sm leading-7 text-neutral-200 outline-none placeholder:text-neutral-600"
        />
      </section>
    </div>
  );
}
