"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import {
  type FormState,
  formFailure,
  formInvalid,
  formSuccess,
} from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

/** Only follow redirects to pages of this app. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

const signInSchema = z.object({
  email: z.email("Enter your email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function signIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const message =
      error.code === "user_banned"
        ? "Your account has been switched off. Ask the shop owner."
        : "That email and password do not match an account.";
    return formFailure(message, formData);
  }
  redirect(safeNext(formData.get("next")));
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ email: z.email("Enter your email address.") })
    .safeParse({
      email: formData.get("email"),
    });
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${origin}/auth/callback?next=/change-password`,
    },
  );
  if (error && error.status === 429) {
    return formFailure(
      "Too many requests. Wait a minute and try again.",
      formData,
    );
  }
  // Same answer whether or not the account exists, so the form cannot be
  // used to find out who has an account.
  return formSuccess(
    "If that email address has an account, a link to reset the password is on its way. Check your inbox and spam folder.",
  );
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(72, "Use 72 characters or fewer.")
      .regex(/[A-Za-z]/, "Include at least one letter.")
      .regex(/\d/, "Include at least one number."),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ["confirm"],
    error: "The two passwords do not match.",
  });

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    redirect("/login");
  }
  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return formInvalid(parsed.error, formData);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    const message =
      error.code === "same_password"
        ? "Choose a password you have not used for this account before."
        : error.code === "weak_password"
          ? "That password is too easy to guess. Try a longer one."
          : "Your password could not be changed. Please try again.";
    return formFailure(message, formData);
  }
  await supabase.rpc("mark_password_changed");
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
