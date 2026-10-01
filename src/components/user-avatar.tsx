import Image from "next/image";

export function UserAvatar({
  avatarUrl,
  firstName,
  lastName,
  size = 38,
}: {
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
  size?: number;
}) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`;
  return (
    <span
      aria-label={`Avatar użytkownika ${firstName} ${lastName}`}
      className="avatar user-avatar"
      style={{ height: size, width: size }}
    >
      {avatarUrl ? (
        <Image alt="" height={size} src={avatarUrl} unoptimized width={size} />
      ) : initials}
    </span>
  );
}
