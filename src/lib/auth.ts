import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
  active: boolean;
  mustChangePassword: boolean;
}

/** The signed-in user and their profile, or null. Checked once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active, must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    active: profile.active,
    mustChangePassword: profile.must_change_password,
  };
});

/**
 * Use at the top of every page's data component. Sends the visitor to the
 * login page, the "switched off" message, or the change-password page.
 */
export async function requireUser(options?: {
  allowPasswordChange?: boolean;
}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.active) {
    redirect("/auth/signout?reason=inactive");
  }
  if (user.mustChangePassword && !options?.allowPasswordChange) {
    redirect("/change-password");
  }
  return user;
}

/** Like requireUser, but also checks the role. */
export async function requireRole(...roles: AppRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/no-access");
  }
  return user;
}

/**
 * For Server Actions: returns the user if they hold one of the roles,
 * otherwise null. Row Level Security still checks every change.
 */
export async function actionUser(
  ...roles: AppRole[]
): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user || !user.active || user.mustChangePassword) {
    return null;
  }
  if (roles.length > 0 && !roles.includes(user.role)) {
    return null;
  }
  return user;
}
