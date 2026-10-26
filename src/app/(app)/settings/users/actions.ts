"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import {
  type FormState,
  formFailure,
  formInvalid,
  formSuccess,
} from "@/lib/form-state";
import { temporaryPassword } from "@/lib/passwords";
import { ROLE_LABELS, ROLES } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formValues, requiredText } from "@/lib/validation";

const NOT_OWNER = "Only owners can manage users.";
// Supabase has no "disable" switch for an account; a very long ban does the same.
const SWITCHED_OFF = "876000h";

const newUserSchema = z.object({
  full_name: requiredText("The name", 100),
  email: z.email("Enter a valid email address."),
  role: z.enum(ROLES, { error: "Choose a role." }),
});

export async function createUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner"))) {
    return formFailure(NOT_OWNER, formData);
  }
  const parsed = newUserSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }
  const { full_name, email, role } = parsed.data;

  const password = temporaryPassword();
  const { error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
    app_metadata: { role, must_change_password: true },
  });
  if (error) {
    const message =
      error.code === "email_exists"
        ? "Someone already has an account with that email address."
        : "The account could not be created. Please try again.";
    return formFailure(message, formData);
  }
  revalidatePath("/settings/users");
  return formSuccess(
    `Account created for ${full_name} (${ROLE_LABELS[role]}).`,
    {
      email,
      password,
    },
  );
}

export async function changeUserRole(
  userId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await actionUser("owner"))) {
    return formFailure(NOT_OWNER);
  }
  const role = z.enum(ROLES).safeParse(formData.get("role"));
  if (!role.success) {
    return formFailure("Choose a role.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_role", {
    p_user_id: userId,
    p_role: role.data,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath("/settings/users");
  return formSuccess(`Role changed to ${ROLE_LABELS[role.data]}.`);
}

export async function resetUserPassword(userId: string): Promise<FormState> {
  const owner = await actionUser("owner");
  if (!owner) {
    return formFailure(NOT_OWNER);
  }
  if (owner.id === userId) {
    return formFailure("To change your own password, use your account page.");
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    return formFailure("That user does not exist.");
  }
  const password = temporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return formFailure("The password could not be reset. Please try again.");
  }
  await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId);
  revalidatePath("/settings/users");
  return formSuccess("Password reset.", { email: profile.email, password });
}

export async function setUserActive(
  userId: string,
  active: boolean,
): Promise<FormState> {
  if (!(await actionUser("owner"))) {
    return formFailure(NOT_OWNER);
  }
  // The database function checks the rules (owners only, not yourself, keep an owner).
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_user_active", {
    p_user_id: userId,
    p_active: active,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  const { error: banError } =
    await createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: active ? "none" : SWITCHED_OFF,
    });
  if (banError) {
    return formFailure(
      "The account was updated, but signing in could not be blocked. Try again.",
    );
  }
  revalidatePath("/settings/users");
  return formSuccess(
    active
      ? "Account switched back on."
      : "Account switched off. They can no longer sign in.",
  );
}
