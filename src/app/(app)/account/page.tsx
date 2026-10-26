import { KeyRoundIcon, LogOutIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/(auth)/actions";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/roles";

import { updateMyName } from "./actions";
import { NameForm } from "./name-form";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Your account" description={user.email} />

      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>
            Your role is <strong>{ROLE_LABELS[user.role]}</strong>:{" "}
            {ROLE_DESCRIPTIONS[user.role]} Only the owner can change roles or
            email addresses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NameForm action={updateMyName} fullName={user.fullName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password and signing out</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/change-password" />}>
            <KeyRoundIcon />
            Change password
          </Button>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              <LogOutIcon />
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
