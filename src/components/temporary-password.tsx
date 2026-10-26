"use client";

import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shows a new temporary password once, with a copy button. */
export function TemporaryPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  return (
    <Alert>
      <KeyRoundIcon />
      <AlertTitle>Temporary password for {email}</AlertTitle>
      <AlertDescription className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 font-mono text-base text-foreground">
            {password}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.clipboard
                .writeText(password)
                .then(() => toast.success("Password copied."))
                .catch(() =>
                  toast.error("Could not copy. Select it and copy by hand."),
                )
            }
          >
            <CopyIcon />
            Copy
          </Button>
        </div>
        <p>
          Give it to them in person or by phone. They will choose their own
          password the first time they sign in. This password is not shown
          again.
        </p>
      </AlertDescription>
    </Alert>
  );
}
