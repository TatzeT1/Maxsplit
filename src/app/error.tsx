"use client";

import { useT } from "@/components/locale-provider";
import { PageError } from "@/components/page-error";

// Catches a render error anywhere below the root layout — including the (app)
// layout itself, which its own error.tsx can't — instead of Next's English
// "Application error" page with no way back.
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT();
  return <PageError error={error} retry={retry} t={t} />;
}
