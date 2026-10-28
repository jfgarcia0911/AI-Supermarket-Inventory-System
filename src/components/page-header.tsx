export function PageHeader({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-2">
        {/* A short citrus stroke, like a price label's edge. */}
        <span aria-hidden className="block h-1 w-9 rounded-full bg-citrus" />
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[2rem]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-[0.95rem] text-pretty text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
      )}
    </div>
  );
}
