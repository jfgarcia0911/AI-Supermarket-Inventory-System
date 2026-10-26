"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FormState } from "@/lib/form-state";

/**
 * A button that runs a Server Action and shows the result as a toast.
 * With `confirm`, it asks first.
 */
export function ActionButton({
  action,
  confirm,
  onResult,
  children,
  ...buttonProps
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<FormState>;
  confirm?: { title: string; description: string; confirmLabel: string };
  onResult?: (result: FormState) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const run = () =>
    startTransition(async () => {
      const result = await action();
      setOpen(false);
      if (result.message) {
        if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      }
      onResult?.(result);
    });

  return (
    <>
      <Button
        type="button"
        {...buttonProps}
        disabled={pending || buttonProps.disabled}
        onClick={() => (confirm ? setOpen(true) : run())}
      >
        {pending && !confirm && <Spinner />}
        {children}
      </Button>
      {confirm && (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button type="button" onClick={run} disabled={pending}>
                {pending && <Spinner />}
                {confirm.confirmLabel}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
