import { requireUser } from "@/auth/session";
import { NotesView } from "@/components/notes-view";
import { listNotes } from "@/notes/queries";

export const metadata = { title: "Notatki" };

export default async function NotesPage() {
  const user = await requireUser();
  const storedNotes = await listNotes(user.id);
  const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
    timeZone: user.timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return <NotesView notes={storedNotes.map((note) => ({
    id: note.id,
    title: note.title,
    body: note.body,
    color: note.color,
    updatedLabel: dateFormatter.format(note.updatedAt),
  }))} />;
}
