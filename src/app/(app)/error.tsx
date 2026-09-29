"use client";

import { useT } from "@/components/locale-provider";
import { PageError } from "@/components/page-error";

// A page under the signed-in shell failed to render: show the fallback inside
// the shell, so the sidebar and navigation stay usable around it.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT();
  return <PageError error={error} retry={retry} t={t} />;
}
