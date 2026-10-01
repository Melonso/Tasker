import type { AuthenticatedUser } from "@/auth/session";
import { countNotes } from "@/notes/queries";
import { countTasksForView } from "@/tasks/queries";

export type NavigationCounts = {
  today: number;
  notes: number;
  current: number;
  waiting: number;
  delegated: number;
  recurring: number;
  done: number;
};

export async function getNavigationCounts(user: AuthenticatedUser): Promise<NavigationCounts> {
  const [today, notes, current, waiting, delegated, recurring, done] = await Promise.all([
    countTasksForView(user, "today"),
    countNotes(user.id),
    countTasksForView(user, "current"),
    countTasksForView(user, "waiting"),
    countTasksForView(user, "delegated"),
    countTasksForView(user, "recurring"),
    countTasksForView(user, "done"),
  ]);

  return { today, notes, current, waiting, delegated, recurring, done };
}
