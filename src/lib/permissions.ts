export const staffRoles = [
  "FRANCHISE_OWNER",
  "FRANCHISE_ADMIN",
  "SHOP_MANAGER",
  "SERVICE_ADVISOR",
  "MECHANIC",
  "INVENTORY_CLERK",
  "ACCOUNTANT",
] as const;
export type StaffRole = (typeof staffRoles)[number];
export type Capability =
  | "bookings"
  | "repairs"
  | "quotes"
  | "inventory"
  | "invoices"
  | "schedule"
  | "staff"
  | "settings"
  | "billing";
const grants: Record<Capability, readonly StaffRole[]> = {
  bookings: [
    "FRANCHISE_OWNER",
    "FRANCHISE_ADMIN",
    "SHOP_MANAGER",
    "SERVICE_ADVISOR",
  ],
  repairs: [
    "FRANCHISE_OWNER",
    "FRANCHISE_ADMIN",
    "SHOP_MANAGER",
    "SERVICE_ADVISOR",
    "MECHANIC",
  ],
  quotes: [
    "FRANCHISE_OWNER",
    "FRANCHISE_ADMIN",
    "SHOP_MANAGER",
    "SERVICE_ADVISOR",
  ],
  inventory: [
    "FRANCHISE_OWNER",
    "FRANCHISE_ADMIN",
    "SHOP_MANAGER",
    "INVENTORY_CLERK",
  ],
  invoices: [
    "FRANCHISE_OWNER",
    "FRANCHISE_ADMIN",
    "SHOP_MANAGER",
    "SERVICE_ADVISOR",
    "ACCOUNTANT",
  ],
  schedule: [
    "FRANCHISE_OWNER",
    "FRANCHISE_ADMIN",
    "SHOP_MANAGER",
    "SERVICE_ADVISOR",
    "MECHANIC",
  ],
  staff: ["FRANCHISE_OWNER", "FRANCHISE_ADMIN"],
  settings: ["FRANCHISE_OWNER", "FRANCHISE_ADMIN", "SHOP_MANAGER"],
  billing: ["FRANCHISE_OWNER", "FRANCHISE_ADMIN"],
};
export function can(role: string | null | undefined, capability: Capability) {
  return grants[capability].some((value) => value === role);
}
export function rolesFor(capability: Capability): StaffRole[] {
  return [...grants[capability]];
}
export function roleLabel(role: string) {
  return role.replaceAll("_", " ").toLowerCase();
}
export const pageCapabilities: Record<string, Capability> = {
  bookings: "bookings",
  jobs: "repairs",
  inventory: "inventory",
  invoices: "invoices",
  schedule: "schedule",
  staff: "staff",
  "garage-settings": "settings",
  billing: "billing",
  history: "repairs",
};

export function canAccessWorkspacePage(
  garage: boolean,
  role: string | null,
  section: string,
  hasInvitation = false,
) {
  if (section === "invitations") return !garage && hasInvitation;
  if (!section) return true;
  if (!garage)
    return ["vehicles", "bookings", "jobs", "history", "invoices"].includes(
      section,
    );
  return !!pageCapabilities[section] && can(role, pageCapabilities[section]);
}
