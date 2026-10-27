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

function navFor(role: AppRole): NavGroup[] {
  const shop: NavGroup = {
    label: "Shop",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/deliveries", label: "Deliveries", icon: "deliveries" },
      { href: "/stock", label: "Stock", icon: "stock" },
      {
        href: "/adjustments",
        label: "Waste & adjustments",
        icon: "adjustments",
      },
      { href: "/products", label: "Products", icon: "products" },
      { href: "/categories", label: "Categories", icon: "categories" },
      { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
    ],
  };
  if (role !== "staff") {
    shop.items.push({ href: "/imports", label: "Imports", icon: "imports" });
  }
  const groups = [shop];
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
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2 px-2 py-1.5 font-semibold"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <StoreIcon className="size-4" />
          </span>
          <span className="leading-tight">
            AI Supermarket
            <span className="block text-xs font-normal text-muted-foreground">
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
  return <NavLinks groups={navFor(user?.role ?? "staff")} />;
}

async function UserFooter() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.fullName}</p>
        <p className="text-xs text-muted-foreground">
          {ROLE_LABELS[user.role]}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          render={<Link href="/account" />}
        >
          <UserRoundIcon />
          Account
        </Button>
        <form action={signOut} className="flex-1">
          <Button type="submit" variant="ghost" size="sm" className="w-full">
            <LogOutIcon />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
