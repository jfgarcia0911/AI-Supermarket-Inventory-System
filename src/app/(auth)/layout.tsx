import {
  ClipboardCheckIcon,
  PackageOpenIcon,
  ScanBarcodeIcon,
  StoreIcon,
} from "lucide-react";

const POINTS = [
  { icon: ScanBarcodeIcon, text: "Scan any product to see its stock" },
  { icon: PackageOpenIcon, text: "Check deliveries in on your phone" },
  { icon: ClipboardCheckIcon, text: "Count, review and approve in minutes" },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
      {/* The brand panel, on wide screens only. */}
      <aside className="awning relative hidden overflow-hidden p-12 text-banner-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 rotate-[-4deg] items-center justify-center rounded-xl bg-citrus text-citrus-foreground shadow-lg">
            <StoreIcon className="size-5" />
          </span>
          <span className="font-display text-xl font-semibold">
            AI Supermarket
          </span>
        </div>

        <div className="max-w-md space-y-8">
          <h1 className="text-5xl leading-[1.05] font-semibold tracking-[-0.03em]">
            Know what&apos;s on your shelves.
          </h1>
          <ul className="space-y-4">
            {POINTS.map((point) => (
              <li key={point.text} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white/12">
                  <point.icon className="size-4" />
                </span>
                <span className="text-banner-foreground/85">{point.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-banner-foreground/60">
          Stock, deliveries, counts and costs for the shop.
        </p>

        <StoreIcon
          aria-hidden
          className="pointer-events-none absolute -right-16 -bottom-16 size-80 rotate-[-10deg] text-white/[0.06]"
        />
      </aside>

      <div className="flex flex-col items-center justify-center gap-8 px-4 py-12">
        <div className="flex items-center gap-3 lg:hidden">
          <span className="flex size-10 rotate-[-4deg] items-center justify-center rounded-xl bg-citrus text-citrus-foreground">
            <StoreIcon className="size-5" />
          </span>
          <span className="font-display text-xl font-semibold">
            AI Supermarket
          </span>
        </div>
        <div className="rise-in w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
