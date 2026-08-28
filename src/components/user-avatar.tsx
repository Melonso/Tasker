import Image from "next/image";

export function UserAvatar({
  avatarDataUrl,
  firstName,
  lastName,
  size = 38,
}: {
  avatarDataUrl: string | null;
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
      {avatarDataUrl ? (
        <Image alt="" height={size} src={avatarDataUrl} unoptimized width={size} />
      ) : initials}
    </span>
  );
}
