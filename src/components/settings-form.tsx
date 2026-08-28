"use client";

import { useActionState } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { removeAvatarAction, updateUserSettingsAction } from "@/settings/actions";

interface SettingsFormProps {
  firstName: string;
  lastName: string;
  defaultTaskHour: number;
  overdueReminderHour: number;
  timeZone: string;
  language: string;
  avatarDataUrl: string | null;
}

export function SettingsForm(props: SettingsFormProps) {
  const [state, action, pending] = useActionState(updateUserSettingsAction, {});

  return (
    <form action={action}>
      <div className="avatar-settings">
        <UserAvatar
          avatarDataUrl={props.avatarDataUrl}
          firstName={props.firstName}
          lastName={props.lastName}
          size={72}
        />
        <div>
          <strong>Zdjęcie profilowe</strong>
          <p>PNG, JPG lub WebP, maksymalnie 1 MB.</p>
          <input accept="image/png,image/jpeg,image/webp" name="avatar" type="file" />
        </div>
        {props.avatarDataUrl ? (
          <button className="text-button" formAction={removeAvatarAction} type="submit">
            Usuń avatar
          </button>
        ) : null}
      </div>
      <div className="form-grid">
        <label>
          Imię
          <input autoComplete="given-name" defaultValue={props.firstName} maxLength={120} name="firstName" required />
        </label>
        <label>
          Nazwisko
          <input autoComplete="family-name" defaultValue={props.lastName} maxLength={160} name="lastName" required />
        </label>
        <label>
          Domyślna godzina zadania
          <input defaultValue={`${String(props.defaultTaskHour).padStart(2, "0")}:00`} name="defaultTaskTime" step={3600} type="time" />
          <small>Używana, gdy podasz tylko datę.</small>
        </label>
        <label>
          Codzienny alert po terminie
          <input defaultValue={`${String(props.overdueReminderHour).padStart(2, "0")}:00`} name="overdueReminderTime" step={3600} type="time" />
          <small>Wysyłany aż do wykonania lub przesunięcia.</small>
        </label>
        <label>
          Strefa czasowa
          <select defaultValue={props.timeZone} name="timeZone">
            <option value="Europe/Warsaw">Europe/Warsaw</option>
          </select>
          <small>Terminy w bazie pozostają zapisane w UTC.</small>
        </label>
        <label>
          Język
          <select defaultValue={props.language} name="language">
            <option value="pl">Polski</option>
          </select>
        </label>
      </div>
      {state.error ? <p className="form-error settings-feedback" role="alert">{state.error}</p> : null}
      {state.success ? <p className="form-success settings-feedback" role="status">{state.success}</p> : null}
      <div className="form-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Zapisywanie…" : "Zapisz ustawienia"}
        </button>
      </div>
    </form>
  );
}
