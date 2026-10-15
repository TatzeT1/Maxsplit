import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The split-flap figure ticks on an interval otherwise.
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

import { LocaleProvider } from "@/components/locale-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_STYLES } from "@/lib/app-style";
import { StylePickerDialog } from "./style-picker-dialog";

function withProviders(ui: React.ReactNode) {
  return render(
    <LocaleProvider initialLocale="de">
      <ThemeProvider>{ui}</ThemeProvider>
    </LocaleProvider>,
  );
}

afterEach(() => {
  delete document.documentElement.dataset.style;
  window.localStorage.clear();
});

describe("StylePickerDialog", () => {
  it("shows a preview of every style and marks the active one", () => {
    document.documentElement.dataset.style = "riso";
    withProviders(<StylePickerDialog open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    const previews = dialog.querySelectorAll("[data-style-preview]");
    expect([...previews].map((el) => el.getAttribute("data-style-preview"))).toEqual([
      ...APP_STYLES,
    ]);
    expect(screen.getByRole("button", { name: /Riso/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Graphit/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switches the whole app to the tapped style and remembers it", async () => {
    const user = userEvent.setup();
    withProviders(<StylePickerDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Herzblatt/ }));

    expect(document.documentElement.dataset.style).toBe("herzblatt");
    expect(window.localStorage.getItem("style")).toBe("herzblatt");
    expect(screen.getByRole("button", { name: /Herzblatt/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // The page's own style hooks follow `<html data-style>`, so one inside a
  // card would paint it in the active style instead of its own. The cards
  // must use the `preview-*` twins only (app-styles.css, "Style previews").
  it("keeps the page's style hooks out of the preview cards", () => {
    document.documentElement.dataset.style = "herzblatt";
    withProviders(<StylePickerDialog open onOpenChange={vi.fn()} />);

    const pageHooks = [
      ".display-figure",
      ".font-heading",
      ".monogram",
      ".bubble-own",
      ".brand-mark",
      ".brand-mark-glyph",
      ".backdrop-light",
      ".backdrop-texture",
      ".category-tile",
      ".tabular-money",
      "[data-slot=button]",
    ].join(",");
    for (const preview of screen.getByRole("dialog").querySelectorAll("[data-style-preview]")) {
      expect(preview.querySelector(pageHooks)).toBeNull();
    }
  });

  it("switches light and dark from inside the gallery", async () => {
    const user = userEvent.setup();
    withProviders(<StylePickerDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "Hell" }));

    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("ThemeToggle", () => {
  it("opens the style gallery from the appearance menu", async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.style = "schmetterling";
    withProviders(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Design wechseln" }));
    const entry = screen.getByRole("menuitem", { name: /Styles/ });
    expect(entry).toHaveTextContent("Gerade: Schmetterling");
    await user.click(entry);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Styles" })).toBeInTheDocument();
  });
});
