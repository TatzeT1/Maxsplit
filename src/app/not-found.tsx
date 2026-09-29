import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getServerT } from "@/lib/i18n/server";

// Unmatched URLs and every notFound() call — including the admin pages',
// which 404 for non-admins on purpose, so this copy never confirms that a
// route exists.
export default async function NotFound() {
  const t = await getServerT();

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="bg-card ring-foreground/10 shadow-e1 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl p-6 text-center ring-1">
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <SearchX aria-hidden="true" className="size-6" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-xl leading-tight font-medium">
            {t("errors.notFoundTitle")}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">{t("errors.notFoundBody")}</p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/groups">{t("errors.backToGroups")}</Link>
        </Button>
      </div>
    </div>
  );
}
