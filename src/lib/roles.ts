import type { Database } from "@/lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLES: AppRole[] = ["owner", "manager", "staff", "viewer"];

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Stock staff",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  owner: "Everything, including users and settings.",
  manager: "Runs the shop day to day: products, suppliers, imports, costs.",
  staff: "Looks up products and stock. Cannot see costs or change products.",
  viewer: "Read-only, including costs. For an accountant or adviser.",
};

/** Products, categories, suppliers and imports. */
export function canEditCatalogue(role: AppRole): boolean {
  return role === "owner" || role === "manager";
}

/** Cost prices and margins are hidden from stock staff. */
export function canSeeCosts(role: AppRole): boolean {
  return role !== "staff";
}

export function isOwner(role: AppRole): boolean {
  return role === "owner";
}
