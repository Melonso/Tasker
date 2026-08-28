export const pilotUsers = [
  {
    email: "pawel.kurek@dpkomis.pl",
    firstName: "Paweł",
    lastName: "Kurek",
    roles: ["BUSINESS_OWNER", "COMPANY_MEMBER"] as const,
  },
  {
    email: "mateusz.meloch@dpkomis.pl",
    firstName: "Mateusz",
    lastName: "Meloch",
    roles: ["APP_ADMIN", "COMPANY_MEMBER"] as const,
  },
  {
    email: "michal.murawski@dpkomis.pl",
    firstName: "Michał",
    lastName: "Murawski",
    roles: ["COMPANY_MEMBER"] as const,
  },
  {
    email: "nadia.kamieniecka-nowak@dpkomis.pl",
    firstName: "Nadia",
    lastName: "Kamieniecka-Nowak",
    roles: ["EXTERNAL"] as const,
  },
] as const;

export type PilotUser = (typeof pilotUsers)[number];
