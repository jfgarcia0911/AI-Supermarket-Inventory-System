import { LogOutIcon, StoreIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/(auth)/actions";
import { type NavGroup, NavLinks } from "@/components/nav-links";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { type AppRole, isOwner, ROLE_LABELS } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

/** The menu, grouped by the job: today's work, the stock, and the office. */
function navFor(role: AppRole, openAlerts: number): NavGroup[] {
  const staff = role === "staff";
  const groups: NavGroup[] = [
    {
      label: "Today",
      items: [
        { href: "/", label: "Dashboard", icon: "dashboard" },
        { href: "/scan", label: "Scan", icon: "scan" },
        { href: "/deliveries", label: "Deliveries", icon: "deliveries" },
        ...(staff
          ? []
          : [{ href: "/sales", label: "Sales", icon: "sales" } as const]),
        { href: "/counts", label: "Counts", icon: "counts" },
        {
          href: "/adjustments",
          label: "Waste & adjustments",
          icon: "adjustments",
        },
      ],
    },
    {
      label: "Stock",
      items: [
        { href: "/stock", label: "Stock", icon: "stock" },
        {
          href: "/alerts",
          label: "Alerts",
          icon: "alerts",
          badge: openAlerts,
        },
        { href: "/products", label: "Products", icon: "products" },
        { href: "/categories", label: "Categories", icon: "categories" },
        { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
      ],
    },
  ];
  if (!staff) {
    groups.push({
      label: "Office",
      items: [
        { href: "/reports", label: "Reports", icon: "reports" },
        { href: "/imports", label: "Imports", icon: "imports" },
      ],
    });
  }
  if (isOwner(role)) {
    groups.push({
      label: "Admin",
      items: [
        { href: "/settings", label: "Settings", icon: "settings" },
        { href: "/settings/users", label: "Users", icon: "users" },
      ],
    });
  }
  return groups;
}

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="pt-4 pb-2">
        <Link href="/" className="group flex items-center gap-3 px-2 py-1">
          <span className="flex size-10 shrink-0 rotate-[-4deg] items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_6px_16px_-6px_oklch(0.78_0.16_62/0.7)] transition-transform group-hover:rotate-0">
            <StoreIcon className="size-5" />
          </span>
          <span className="leading-none">
            <span className="block font-display text-lg font-semibold tracking-[-0.01em]">
              AI Supermarket
            </span>
            <span className="mt-1 block text-[0.7rem] font-medium tracking-[0.18em] text-sidebar-foreground/60 uppercase">
              Inventory
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={<NavSkeleton />}>
          <RoleNav />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={<SidebarMenuSkeleton showIcon />}>
          <UserFooter />
        </Suspense>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 5 }, (_, i) => (
        <SidebarMenuSkeleton key={i} showIcon />
      ))}
    </div>
  );
}

async function RoleNav() {
  const user = await getCurrentUser();
  // Open alerts that need attention (critical or warning), as a badge.
  let openAlerts = 0;
  if (user) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .in("severity", ["critical", "warning"]);
    openAlerts = count ?? 0;
  }
  return <NavLinks groups={navFor(user?.role ?? "staff", openAlerts)} />;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

async function UserFooter() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  return (
    <div className="space-y-3 rounded-xl bg-sidebar-accent/70 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-foreground/15 font-display text-sm font-semibold">
          {initials(user.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="text-xs text-sidebar-foreground/65">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 bg-sidebar-foreground/10 text-sidebar-foreground hover:bg-sidebar-foreground/20 hover:text-sidebar-accent-foreground"
          render={<Link href="/account" />}
        >
          <UserRoundIcon />
          Account
        </Button>
        <form action={signOut} className="flex-1">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full text-sidebar-foreground hover:bg-sidebar-foreground/10 hover:text-sidebar-accent-foreground"
          >
            <LogOutIcon />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
