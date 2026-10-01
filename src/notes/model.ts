export const noteColors = ["NEUTRAL", "YELLOW", "GREEN", "BLUE", "PINK", "PURPLE"] as const;

export type NoteColor = (typeof noteColors)[number];

export const noteColorLabels: Record<NoteColor, string> = {
  NEUTRAL: "Neutralny",
  YELLOW: "Żółty",
  GREEN: "Zielony",
  BLUE: "Niebieski",
  PINK: "Różowy",
  PURPLE: "Fioletowy",
};

export function noteTitleFromBody(body: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  const sentence = compact.split(/(?<=[.!?])\s/, 1)[0] || compact;
  if (sentence.length <= 80) return sentence;
  return `${sentence.slice(0, 77).trimEnd()}…`;
}
