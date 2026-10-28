// The colours a status badge can take (see components/ui/badge.tsx).

import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";

export type BadgeColour = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>;
