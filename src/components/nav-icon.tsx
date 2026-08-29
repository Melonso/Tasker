export type NavIconName =
  | "home"
  | "tasks"
  | "waiting"
  | "delegated"
  | "repeat"
  | "done"
  | "notifications"
  | "settings"
  | "admin"
  | "teams"
  | "more"
  | "add";

export function NavIcon({ name, size = 19 }: { name: NavIconName; size?: number }) {
  const common = {
    fill: "none",
    height: size,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    width: size,
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return <svg {...common}><path d="M3.5 10.5 12 3l8.5 7.5" /><path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6" /></svg>;
    case "tasks":
      return <svg {...common}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1.2 1.2L7 4.8M3.5 12l1.2 1.2L7 10.8M3.5 18l1.2 1.2L7 16.8" /></svg>;
    case "waiting":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "delegated":
      return <svg {...common}><path d="M5 19 19 5M9 5h10v10" /><path d="M5 9v10h10" /></svg>;
    case "repeat":
      return <svg {...common}><path d="M17 2.8 20.2 6 17 9.2" /><path d="M4 11V9a3 3 0 0 1 3-3h13M7 21.2 3.8 18 7 14.8" /><path d="M20 13v2a3 3 0 0 1-3 3H4" /></svg>;
    case "done":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 9" /></svg>;
    case "notifications":
      return <svg {...common}><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8" /><path d="M10 21h4" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
    case "admin":
      return <svg {...common}><path d="M12 3 4.5 6v5c0 4.7 3.1 8.6 7.5 10 4.4-1.4 7.5-5.3 7.5-10V6L12 3Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "teams":
      return <svg {...common}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M14 15.5a4.5 4.5 0 0 1 6.5 4" /></svg>;
    case "more":
      return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>;
    case "add":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  }
}
