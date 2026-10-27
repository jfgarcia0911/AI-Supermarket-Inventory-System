"use server";

import { revalidatePath } from "next/cache";

import { actionUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { type FormState, formFailure, formSuccess } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

export async function acknowledgeAlert(alertId: string): Promise<FormState> {
  if (!(await actionUser("owner", "manager", "staff"))) {
    return formFailure("You do not have permission to change alerts.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_alert", {
    p_alert_id: alertId,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath("/alerts");
  revalidatePath("/");
  return formSuccess("Marked as seen. It closes by itself once fixed.");
}

export async function resolveAlert(alertId: string): Promise<FormState> {
  if (!(await actionUser("owner", "manager"))) {
    return formFailure("Only owners and managers can close alerts.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_alert", {
    p_alert_id: alertId,
  });
  if (error) {
    return formFailure(friendlyDbError(error));
  }
  revalidatePath("/alerts");
  revalidatePath("/");
  return formSuccess("Alert closed.");
}
