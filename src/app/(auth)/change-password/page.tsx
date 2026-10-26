import type { Metadata } from "next";
import { Suspense } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Choose a password" };

export default function ChangePasswordPage() {
  return (
    <Card>
      <Suspense fallback={<Skeleton className="m-6 h-48" />}>
        <ChangePassword />
      </Suspense>
    </Card>
  );
}

async function ChangePassword() {
  const user = await requireUser({ allowPasswordChange: true });
  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>
          {user.mustChangePassword
            ? "You signed in with a temporary password. Choose your own before you carry on."
            : `Signed in as ${user.email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm />
      </CardContent>
    </>
  );
}
