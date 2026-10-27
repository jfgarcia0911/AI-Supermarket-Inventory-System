"use client";

import {
  ClipboardCheckIcon,
  HouseIcon,
  MenuIcon,
  PackageOpenIcon,
  ScanBarcodeIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: HouseIcon },
  { href: "/scan", label: "Scan", icon: ScanBarcodeIcon },
  { href: "/deliveries", label: "Deliveries", icon: PackageOpenIcon },
  { href: "/counts", label: "Counts", icon: ClipboardCheckIcon },
];

/** The phone's bottom bar: the everyday jobs, and "More" for everything else. */
export function MobileNav() {
  // Reading the address waits for the request, so show the bar without a
  // highlighted tab until then.
  return (
    <Suspense fallback={<Bar pathname={null} />}>
      <BarForPage />
    </Suspense>
  );
}

function BarForPage() {
  return <Bar pathname={usePathname()} />;
}

function Bar({ pathname }: { pathname: string | null }) {
  const { setOpenMobile } = useSidebar();

  const active = (href: string) =>
    pathname !== null &&
    (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const itemClass = (on: boolean) =>
    cn(
      "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
      on ? "font-medium text-foreground" : "text-muted-foreground",
    );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={itemClass(active(item.href))}
          aria-current={active(item.href) ? "page" : undefined}
        >
          <item.icon className="size-5" />
          {item.label}
        </Link>
      ))}
      <button
        type="button"
        className={itemClass(false)}
        onClick={() => setOpenMobile(true)}
      >
        <MenuIcon className="size-5" />
        More
      </button>
    </nav>
  );
}
