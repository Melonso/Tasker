"use client";

import { useState } from "react";

import {
  createNoteReminderScheduleAction,
  deleteNoteReminderScheduleAction,
  toggleNoteReminderScheduleAction,
} from "@/notes/reminder-actions";

const weekdays = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

interface NoteReminderScheduleView {
  id: string;
  frequency: "DAILY" | "WEEKLY";
  weekday: number | null;
  time: string;
  enabled: boolean;
  nextLabel: string;
}

export function NoteReminderSettings({ schedules }: { schedules: NoteReminderScheduleView[] }) {
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY">("DAILY");
  return (
    <div className="note-reminder-settings">
      <div className="note-reminder-list">
        {schedules.length ? schedules.map((schedule) => (
          <article className={schedule.enabled ? "note-reminder-row" : "note-reminder-row disabled"} key={schedule.id}>
            <div>
              <strong>{schedule.frequency === "DAILY" ? "Codziennie" : `Co tydzień · ${weekdays[schedule.weekday ?? 1]}`} o {schedule.time}</strong>
              <small>{schedule.enabled ? `Następne: ${schedule.nextLabel}` : "Przypomnienie wyłączone"}</small>
            </div>
            <form action={toggleNoteReminderScheduleAction}>
              <input name="scheduleId" type="hidden" value={schedule.id} />
              <input name="enabled" type="hidden" value={schedule.enabled ? "false" : "true"} />
              <button className="text-button" type="submit">{schedule.enabled ? "Wyłącz" : "Włącz"}</button>
            </form>
            <form action={deleteNoteReminderScheduleAction}>
              <input name="scheduleId" type="hidden" value={schedule.id} />
              <button className="text-button danger" type="submit">Usuń</button>
            </form>
          </article>
        )) : (
          <div className="empty-inline"><strong>Przypomnienia są wyłączone.</strong><span>Dodaj jedną lub kilka pór poniżej.</span></div>
        )}
      </div>
      <form action={createNoteReminderScheduleAction} className="note-reminder-create-form">
        <label>
          Częstotliwość
          <select name="frequency" onChange={(event) => setFrequency(event.target.value as "DAILY" | "WEEKLY")} value={frequency}>
            <option value="DAILY">Codziennie</option>
            <option value="WEEKLY">Co tydzień</option>
          </select>
        </label>
        {frequency === "WEEKLY" ? (
          <label>
            Dzień tygodnia
            <select defaultValue="1" name="weekday">
              {weekdays.map((label, value) => <option key={label} value={value}>{label}</option>)}
            </select>
          </label>
        ) : <input name="weekday" type="hidden" value="1" />}
        <label>
          Godzina
          <input defaultValue="09:00" name="time" required step={60} type="time" />
        </label>
        <button className="secondary-button" type="submit">Dodaj porę</button>
      </form>
      <p className="settings-hint">Treść: „Pamiętaj, aby uporządkować swoje notatki” z bezpośrednim linkiem do modułu.</p>
    </div>
  );
}
