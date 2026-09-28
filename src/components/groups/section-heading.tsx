import type { ReactNode } from "react";

/** The one heading style inside a group page's tabs: Fraunces, with an optional action or count on the right. */
export function SectionHeading({
  children,
  aside,
  id,
}: {
  children: ReactNode;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <h2 id={id} className="font-heading text-lg leading-tight font-medium">
        {children}
      </h2>
      {aside}
    </div>
  );
}
