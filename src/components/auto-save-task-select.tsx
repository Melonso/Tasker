"use client";

import { useState, useTransition } from "react";

interface SelectOption {
  label: string;
  value: string;
}

interface AutoSaveTaskSelectProps {
  action: (formData: FormData) => Promise<void>;
  ariaLabel: string;
  caption?: string;
  fieldName: "taskScope" | "priority";
  options: SelectOption[];
  taskId: string;
  value: string;
  variant?: "detail" | "menu" | "row";
}

export function AutoSaveTaskSelect({
  action,
  ariaLabel,
  caption,
  fieldName,
  options,
  taskId,
  value,
  variant = "detail",
}: AutoSaveTaskSelectProps) {
  const [selectedValue, setSelectedValue] = useState(value);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!pending && value !== selectedValue && error === "") {
    setSelectedValue(value);
  }

  function save(nextValue: string) {
    const previousValue = selectedValue;
    setSelectedValue(nextValue);
    setError("");

    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set(fieldName, nextValue);

    startTransition(async () => {
      try {
        await action(formData);
      } catch {
        setSelectedValue(previousValue);
        setError("Nie udało się zapisać.");
      }
    });
  }

  return (
    <label
      className={`task-auto-save-select ${variant} ${fieldName === "taskScope" ? selectedValue.toLowerCase() : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {caption ? <span className="task-auto-save-caption">{caption}</span> : null}
      <span className="task-auto-save-control">
        <select
          aria-busy={pending}
          aria-label={ariaLabel}
          disabled={pending}
          onChange={(event) => save(event.currentTarget.value)}
          value={selectedValue}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <span aria-live="polite" className={`task-auto-save-status ${error ? "error" : ""}`}>
          {error || (pending ? "Zapisywanie…" : "")}
        </span>
      </span>
    </label>
  );
}
