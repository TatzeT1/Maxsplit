import { createElement, type ReactElement } from "react";
import {
  Car,
  Film,
  HeartPulse,
  Home,
  MoreHorizontal,
  Plane,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { CategoryId } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translate";

export const CATEGORY_IDS: CategoryId[] = [
  "groceries",
  "restaurant",
  "transport",
  "housing",
  "utilities",
  "entertainment",
  "travel",
  "shopping",
  "health",
  "other",
];

const CATEGORY_ICONS: Record<CategoryId, LucideIcon> = {
  groceries: ShoppingCart,
  restaurant: UtensilsCrossed,
  transport: Car,
  housing: Home,
  utilities: Zap,
  entertainment: Film,
  travel: Plane,
  shopping: ShoppingBag,
  health: HeartPulse,
  other: MoreHorizontal,
};

export function categoryIcon(category: CategoryId | null): LucideIcon {
  return category ? CATEGORY_ICONS[category] : MoreHorizontal;
}

/** Tailwind bg/text/ring classes so each category reads as its own color, not a flat gray circle. */
const CATEGORY_COLORS: Record<CategoryId, string> = {
  groceries: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  restaurant: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  transport: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  housing: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  utilities: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  entertainment: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  travel: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  shopping: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  health: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  other: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

export function categoryColorClasses(category: CategoryId | null): string {
  return category ? CATEGORY_COLORS[category] : CATEGORY_COLORS.other;
}

/** Very light full-row background wash, same hues as `categoryColorClasses` but faint enough to sit behind text. */
const CATEGORY_ROW_TINTS: Record<CategoryId, string> = {
  groceries: "bg-emerald-500/[0.09]",
  restaurant: "bg-orange-500/[0.09]",
  transport: "bg-sky-500/[0.09]",
  housing: "bg-violet-500/[0.09]",
  utilities: "bg-amber-500/[0.09]",
  entertainment: "bg-pink-500/[0.09]",
  travel: "bg-cyan-500/[0.09]",
  shopping: "bg-fuchsia-500/[0.09]",
  health: "bg-rose-500/[0.09]",
  other: "bg-slate-500/[0.09]",
};

export function categoryRowTintClass(category: CategoryId | null): string {
  return category ? CATEGORY_ROW_TINTS[category] : CATEGORY_ROW_TINTS.other;
}

/** Renders a category's icon as an element, avoiding a dynamic JSX tag reference. */
export function categoryIconElement(category: CategoryId | null, className?: string): ReactElement {
  return createElement(categoryIcon(category), { className });
}

export function categoryLabel(
  category: CategoryId | null,
  t: (key: TranslationKey) => string,
): string {
  return t(("categories." + (category ?? "other")) as TranslationKey);
}
