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

/**
 * The phone's bottom bar, a glass dock floating above the page: the everyday
 * jobs, and "More" for everything else.
 */
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
      "group flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[0.7rem]",
      on ? "font-semibold text-primary" : "text-muted-foreground",
    );
  const iconClass = (on: boolean) =>
    cn(
      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
      on ? "bg-secondary" : "group-active:bg-muted",
    );

  return (
    <nav
      aria-label="Main"
      className="glass-rim fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 flex rounded-2xl glass-strong px-1 shadow-[0_14px_34px_-12px_oklch(0.3_0.05_160/0.4)] ring-1 ring-(--glass-line) md:hidden"
    >
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={itemClass(active(item.href))}
          aria-current={active(item.href) ? "page" : undefined}
        >
          <span className={iconClass(active(item.href))}>
            <item.icon className="size-5" />
          </span>
          {item.label}
        </Link>
      ))}
      <button
        type="button"
        className={itemClass(false)}
        onClick={() => setOpenMobile(true)}
      >
        <span className={iconClass(false)}>
          <MenuIcon className="size-5" />
        </span>
        More
      </button>
    </nav>
  );
}
