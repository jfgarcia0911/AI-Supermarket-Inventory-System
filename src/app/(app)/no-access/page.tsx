import { LockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata: Metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LockIcon />
        </EmptyMedia>
        <EmptyTitle>You do not have access to that page</EmptyTitle>
        <EmptyDescription>
          Your role does not include it. Ask the shop owner if you need it.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button render={<Link href="/" />}>Go to the dashboard</Button>
      </EmptyContent>
    </Empty>
  );
}
