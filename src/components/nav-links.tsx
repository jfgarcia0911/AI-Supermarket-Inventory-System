"use client";

import {
  BellIcon,
  BoxesIcon,
  ChartColumnIcon,
  ClipboardCheckIcon,
  ClipboardMinusIcon,
  FileUpIcon,
  FolderTreeIcon,
  LayoutDashboardIcon,
  PackageIcon,
  PackageOpenIcon,
  ReceiptIcon,
  ScanBarcodeIcon,
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const ICONS = {
  dashboard: LayoutDashboardIcon,
  scan: ScanBarcodeIcon,
  deliveries: PackageOpenIcon,
  sales: ReceiptIcon,
  stock: BoxesIcon,
  counts: ClipboardCheckIcon,
  adjustments: ClipboardMinusIcon,
  alerts: BellIcon,
  reports: ChartColumnIcon,
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
  /** A number to show next to the link, such as open alerts. */
  badge?: number;
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
          <SidebarGroupLabel className="text-[0.68rem] font-semibold tracking-[0.16em] text-sidebar-foreground/50 uppercase">
            {group.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={item.href === activeHref}
                      className="relative h-9 text-sidebar-foreground/80 hover:text-sidebar-accent-foreground data-active:text-sidebar-accent-foreground data-active:before:absolute data-active:before:inset-y-2 data-active:before:left-0 data-active:before:w-1 data-active:before:rounded-full data-active:before:bg-sidebar-primary data-active:[&_svg]:text-sidebar-primary"
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
                    {item.badge ? (
                      <SidebarMenuBadge className="top-2 rounded-full bg-sidebar-primary px-1.5 text-sidebar-primary-foreground peer-hover/menu-button:text-sidebar-primary-foreground peer-data-active/menu-button:text-sidebar-primary-foreground">
                        {item.badge}
                      </SidebarMenuBadge>
                    ) : null}
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
