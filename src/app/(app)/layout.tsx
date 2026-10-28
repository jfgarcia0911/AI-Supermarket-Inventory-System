import { StoreIcon } from "lucide-react";
import Link from "next/link";

import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* Transparent, so the colour wash shows through the glass. */}
      <SidebarInset className="bg-transparent">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-(--glass-line) glass px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4 md:hidden" />
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-[0.95rem] font-semibold md:hidden"
          >
            <span className="flex size-6 rotate-[-4deg] items-center justify-center rounded-md bg-citrus text-citrus-foreground">
              <StoreIcon className="size-3.5" />
            </span>
            AI Supermarket
          </Link>
        </header>
        <main className="rise-in mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-8">
          {children}
        </main>
        <MobileNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
