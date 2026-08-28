export interface TaskAccessSubject {
  userId: string;
  roles: string[];
}

export interface TaskAccessResource {
  authorId: string;
  assigneeId: string;
  visibility: "PRIVATE" | "COMPANY" | "SHARED";
  sharedUserIds?: string[];
}

export function isCompanyUser(roles: string[]) {
  return roles.some((role) =>
    ["BUSINESS_OWNER", "COMPANY_MEMBER"].includes(role),
  );
}

export function canAccessTask(subject: TaskAccessSubject, task: TaskAccessResource) {
  if (task.authorId === subject.userId || task.assigneeId === subject.userId) return true;
  if (task.visibility === "COMPANY" && isCompanyUser(subject.roles)) return true;
  if (task.visibility === "SHARED" && task.sharedUserIds?.includes(subject.userId)) return true;
  return false;
}
