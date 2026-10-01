"use client";

import { useActionState, useEffect, useRef } from "react";

import { createNoteAction } from "@/notes/actions";
import { noteColorLabels, noteColors } from "@/notes/model";

interface NoteCreateFormProps {
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function NoteCreateForm({ onCancel, onSuccess }: NoteCreateFormProps) {
  const [state, action, pending] = useActionState(createNoteAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    onSuccess?.();
  }, [onSuccess, state.success]);

  return (
    <form action={action} className="note-create-form" ref={formRef}>
      <label>
        Tytuł <span>opcjonalny — możemy utworzyć go z treści</span>
        <input maxLength={160} name="title" placeholder="Np. Pomysły na prezentację" />
      </label>
      <label className="wide-field">
        Treść
        <textarea maxLength={10_000} name="body" placeholder="Zapisz myśl, informację albo coś do późniejszego uporządkowania…" required rows={5} />
      </label>
      <label>
        Kolor
        <select defaultValue="NEUTRAL" name="color">
          {noteColors.map((color) => <option key={color} value={color}>{noteColorLabels[color]}</option>)}
        </select>
      </label>
      <div className="note-create-actions">
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        {state.success ? <p className="form-success" role="status">{state.success}</p> : null}
        {onCancel ? <button className="secondary-button" disabled={pending} onClick={onCancel} type="button">Anuluj</button> : null}
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Zapisywanie…" : "Dodaj notatkę"}
        </button>
      </div>
    </form>
  );
}
