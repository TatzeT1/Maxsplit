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

/**
 * Whether `value` is one of CATEGORY_IDS. The server checks this before
 * storing an expense: an unknown id has no icon or dictionary label, so
 * rendering it would throw and take the group page down for every member.
 */
export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value);
}

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

/**
 * Classes for a category's icon tile. `.category-tile` is a neutral tile in
 * most styles; the Original style colors it per category (`data-category`
 * via the `category-<id>` class, see globals.css).
 */
export function categoryTileClasses(category: CategoryId | null): string {
  return `category-tile category-${category ?? "other"}`;
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
