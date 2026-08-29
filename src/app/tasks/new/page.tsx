import { requireUser } from "@/auth/session";
import { NewTaskForm } from "@/components/new-task-form";
import { listAssignableUsers, listTeamsForSharing } from "@/tasks/queries";

export const metadata = { title: "Nowe zadanie" };

export default async function NewTaskPage() {
  const user = await requireUser();
  const [assignees, teams] = await Promise.all([
    listAssignableUsers(user),
    listTeamsForSharing(user),
  ]);

  return (
    <div className="page-stack narrow-page">
      <header className="page-header">
        <div><p className="eyebrow">Zadania</p><h1>Dodaj nowe zadanie</h1><p>Ustal odpowiedzialność i termin. Przypomnienia zaplanują się automatycznie.</p></div>
      </header>
      <NewTaskForm assignees={assignees} currentUserId={user.id} teams={teams} />
    </div>
  );
}
