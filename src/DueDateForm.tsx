import { useState, type FormEvent } from "react";
import { dueDateError } from "./library.ts";

// The draft lives here. The parent keys this component by the book's identity, so a draft is
// discarded, not handed to a neighbour, when the list shifts after a removal.
export function DueDateForm({
  id,
  title,
  dueDate,
  onSave,
}: {
  id: string;
  title: string;
  dueDate: string | undefined;
  onSave: (date: string | null) => void;
}) {
  const [draft, setDraft] = useState(dueDate ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    // A native date input reads empty while being edited, so empty never clears: use Clear.
    const message =
      draft.trim() === "" ? "Enter a date, or use Clear due date." : dueDateError(draft);
    setError(message);
    if (!message) onSave(draft.trim());
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={id}>
        Due date<span className="visually-hidden"> for {title}</span>
      </label>
      <input
        id={id}
        type="date"
        value={draft}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" aria-label={`Set due date for ${title}`}>Set due date</button>
      {dueDate && (
        <button type="button" aria-label={`Clear due date for ${title}`} onClick={() => onSave(null)}>
          Clear due date
        </button>
      )}
      {error && <p id={`${id}-error`} role="alert" className="error">Error: {error}</p>}
    </form>
  );
}
