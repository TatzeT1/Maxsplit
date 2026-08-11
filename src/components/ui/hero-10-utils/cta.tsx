import Link from "next/link";
import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";

export interface CtaProps extends VariantProps<typeof buttonVariants> {
  ctaEnabled?: boolean;
  text: string;
  link?: string;
}

export function Cta({ cta }: Readonly<{ cta: CtaProps }>) {
  const { text, link, variant, size } = cta;

  return (
    <Button asChild variant={variant} size={size}>
      <Link href={link || "#"}>{text}</Link>
    </Button>
  );
}
