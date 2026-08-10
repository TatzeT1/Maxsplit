import { t } from "@/lib/i18n/de";

export default function GroupsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-xl font-semibold">{t("groups.title")}</h1>
      <p className="text-muted-foreground max-w-sm">{t("groups.empty")}</p>
    </div>
  );
}
