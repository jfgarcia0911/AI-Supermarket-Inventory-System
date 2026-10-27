import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/skeletons";
import { requireUser } from "@/lib/auth";
import { canEditCatalogue } from "@/lib/roles";
import { paramText } from "@/lib/search-params";

import { ScanView } from "./scan-view";

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage(props: PageProps<"/scan">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Scan searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Scan({
  searchParams,
}: {
  searchParams: PageProps<"/scan">["searchParams"];
}) {
  const user = await requireUser();
  const code = paramText((await searchParams).code);

  return (
    <>
      <PageHeader
        title="Scan"
        description="Scan a barcode with a handheld scanner or the camera, or type a code or name."
      />
      <ScanView
        canEdit={canEditCatalogue(user.role)}
        canAdjust={user.role !== "viewer"}
        initialUnknown={code ? code.toUpperCase().slice(0, 40) : null}
      />
    </>
  );
}
