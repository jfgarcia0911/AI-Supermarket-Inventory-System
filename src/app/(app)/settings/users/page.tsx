import type { Metadata } from "next";
import { Suspense } from "react";

import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

import {
  changeUserRole,
  createUser,
  resetUserPassword,
  setUserActive,
} from "./actions";
import { AddUserForm, ResetPasswordButton, RoleForm } from "./user-forms";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const me = await requireRole("owner");
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active, must_change_password")
    .order("active", { ascending: false })
    .order("full_name");

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone has their own sign-in, so the history shows who did what."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a person</CardTitle>
          <CardDescription>
            They get a temporary password to sign in with, then choose their
            own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddUserForm action={createUser} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(users ?? []).map((user) => {
          const isMe = user.id === me.id;
          return (
            <Card
              key={user.id}
              className={user.active ? undefined : "opacity-70"}
            >
              <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {user.full_name}
                    {isMe && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
                    {!user.active && (
                      <Badge variant="outline">Switched off</Badge>
                    )}
                    {user.active && user.must_change_password && (
                      <Badge variant="outline">
                        Has not chosen a password yet
                      </Badge>
                    )}
                  </div>
                </div>
                {!isMe && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <RoleForm
                      action={changeUserRole.bind(null, user.id)}
                      role={user.role}
                    />
                    {user.active && (
                      <ResetPasswordButton
                        action={resetUserPassword.bind(null, user.id)}
                        name={user.full_name}
                      />
                    )}
                    <ActionButton
                      variant="outline"
                      size="sm"
                      action={setUserActive.bind(null, user.id, !user.active)}
                      confirm={
                        user.active
                          ? {
                              title: `Switch off ${user.full_name}'s account?`,
                              description:
                                "They will not be able to sign in. Everything they did stays in the history. You can switch the account back on later.",
                              confirmLabel: "Switch off",
                            }
                          : undefined
                      }
                    >
                      {user.active ? "Switch off" : "Switch on"}
                    </ActionButton>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
