import { StoreIcon } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <div className="flex items-center gap-2 font-medium">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <StoreIcon className="size-4" />
        </div>
        AI Supermarket Inventory
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
