import type { MetadataRoute } from "next";
import { getServerT } from "@/lib/i18n/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getServerT();
  return {
    name: t("app.name"),
    short_name: t("app.name"),
    description: t("app.tagline"),
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
