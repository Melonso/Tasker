"use client";

import { useActionState, useEffect, useState } from "react";

import { NoteCreateForm } from "@/components/note-create-form";
import { deleteNoteAction, updateNoteAction } from "@/notes/actions";
import { noteColorLabels, noteColors, type NoteColor } from "@/notes/model";

export interface NotesViewItem {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  updatedLabel: string;
}

interface NotesViewProps {
  notes: NotesViewItem[];
}

function confirmNoteDeletion(event: React.MouseEvent<HTMLButtonElement>) {
  if (!window.confirm("Usunąć tę notatkę? Tej operacji nie można cofnąć.")) event.preventDefault();
}

function NoteEditRow({ note, onCancel, onSaved }: { note: NotesViewItem; onCancel: () => void; onSaved: () => void }) {
  const [state, action, pending] = useActionState(updateNoteAction, {});

  useEffect(() => {
    if (state.success) onSaved();
  }, [onSaved, state.success]);

  return (
    <form action={action} className={`note-table-edit-row note-${note.color.toLowerCase()}`}>
      <input name="noteId" type="hidden" value={note.id} />
      <label className="note-table-edit-cell">
        <span>Tytuł</span>
        <input aria-label="Tytuł notatki" autoFocus defaultValue={note.title} maxLength={160} name="title" />
      </label>
      <label className="note-table-edit-cell note-table-edit-body">
        <span>Treść</span>
        <textarea aria-label="Treść notatki" defaultValue={note.body} maxLength={10_000} name="body" required rows={3} />
      </label>
      <label className="note-table-edit-cell">
        <span>Kolor</span>
        <select aria-label="Kolor notatki" defaultValue={note.color} name="color">
          {noteColors.map((color) => <option key={color} value={color}>{noteColorLabels[color]}</option>)}
        </select>
      </label>
      <time className="note-table-updated">{note.updatedLabel}</time>
      <div className="note-table-edit-actions">
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        <button className="primary-button" disabled={pending} type="submit">{pending ? "Zapisywanie…" : "Zapisz"}</button>
        <button className="secondary-button" disabled={pending} onClick={onCancel} type="button">Anuluj</button>
        <button className="text-button danger" formAction={deleteNoteAction} formNoValidate onClick={confirmNoteDeletion} type="submit">Usuń</button>
      </div>
    </form>
  );
}

export function NotesView({ notes }: NotesViewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="page-stack notes-page">
      <header className="page-header notes-page-header">
        <div>
          <p className="eyebrow">Osobny moduł</p>
          <h1>Notatki</h1>
          <p>Prywatne miejsce na rzeczy, które nie są zadaniami.</p>
        </div>
        <button
          aria-expanded={createOpen}
          className="primary-button notes-add-button"
          onClick={() => setCreateOpen((open) => !open)}
          type="button"
        >
          {createOpen ? "Zamknij formularz" : "+ Dodaj notatkę"}
        </button>
      </header>

      {createOpen ? (
        <section className="panel note-create-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Szybki zapis</p><h2>Nowa notatka</h2></div>
          </div>
          <NoteCreateForm onCancel={() => setCreateOpen(false)} onSuccess={() => setCreateOpen(false)} />
        </section>
      ) : null}

      <section>
        <div className="notes-section-heading">
          <div><p className="eyebrow">Twoja przestrzeń</p><h2>Zapisane notatki</h2></div>
          <span>{notes.length}</span>
        </div>

        {notes.length ? (
          <div className="notes-table-shell">
            <div aria-hidden="true" className="notes-table-header">
              <span>Tytuł</span><span>Treść</span><span>Kolor</span><span>Aktualizacja</span><span>Akcje</span>
            </div>
            <div className="notes-table-body">
              {notes.map((note) => editingId === note.id ? (
                <NoteEditRow key={note.id} note={note} onCancel={() => setEditingId(null)} onSaved={() => setEditingId(null)} />
              ) : (
                <div className={`note-table-row note-${note.color.toLowerCase()}`} id={`note-${note.id}`} key={note.id}>
                  <button
                    aria-label={`Edytuj notatkę: ${note.title}`}
                    className="note-row-edit-trigger"
                    onClick={() => setEditingId(note.id)}
                    type="button"
                  >
                    <strong className="note-table-title">{note.title}</strong>
                    <span className="note-table-body-preview">{note.body}</span>
                    <span className="note-color-label"><i aria-hidden="true" className="note-color-dot" />{noteColorLabels[note.color]}</span>
                    <time className="note-table-updated">{note.updatedLabel}</time>
                  </button>
                  <form action={deleteNoteAction} className="note-table-delete-form">
                    <input name="noteId" type="hidden" value={note.id} />
                    <button aria-label={`Usuń notatkę: ${note.title}`} className="text-button danger" onClick={confirmNoteDeletion} type="submit">Usuń</button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state notes-empty-state">
            <span aria-hidden="true">✎</span>
            <h3>Jeszcze nic tu nie ma</h3>
            <p>Dodaj pierwszą notatkę przyciskiem u góry albo napisz do bota: „Zapisz w notatkach…”</p>
          </div>
        )}
      </section>
    </div>
  );
}
