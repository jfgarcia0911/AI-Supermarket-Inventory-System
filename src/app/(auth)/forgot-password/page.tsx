import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Forgot your password?</CardTitle>
        <CardDescription>
          We will email you a link to choose a new one. If no email arrives, ask
          the shop owner to reset your password for you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
