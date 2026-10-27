"use client";

import {
  BoxesIcon,
  ClipboardMinusIcon,
  FileUpIcon,
  FolderTreeIcon,
  LayoutDashboardIcon,
  PackageIcon,
  PackageOpenIcon,
  SettingsIcon,
  TruckIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const ICONS = {
  dashboard: LayoutDashboardIcon,
  deliveries: PackageOpenIcon,
  stock: BoxesIcon,
  adjustments: ClipboardMinusIcon,
  products: PackageIcon,
  categories: FolderTreeIcon,
  suppliers: TruckIcon,
  imports: FileUpIcon,
  settings: SettingsIcon,
  users: UsersIcon,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  // The longest matching link wins, so /settings/users highlights only "Users".
  const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));
  const activeHref = hrefs
    .filter(
      (href) =>
        pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)),
    )
    .sort((a, b) => b.length - a.length)[0];

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={item.href === activeHref}
                      render={
                        <Link
                          href={item.href}
                          onClick={() => setOpenMobile(false)}
                        />
                      }
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
