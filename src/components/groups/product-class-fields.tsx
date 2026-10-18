"use client";

import { Pencil } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  isProductFamilyId,
  MAX_PRODUCT_KIND_LENGTH,
  PRODUCT_FAMILY_IDS,
  productFamilyEmoji,
  productFamilyLabelKey,
} from "@/lib/products/products";
import type { ProductClass, ProductFamilyId } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * "🥩 Mett" — what a receipt line or an expense is, as a tap target that
 * opens ProductClassFields. Without a class it says what will happen
 * (`pendingLabel`), so a missing one never looks like a broken one.
 */
export function ProductChip({
  product,
  pendingLabel,
  expanded,
  onClick,
}: {
  product: ProductClass | null;
  pendingLabel: string;
  expanded: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={`${t("products.change")}: ${product ? `${t(productFamilyLabelKey(product.family))} · ${product.kind}` : pendingLabel}`}
      onClick={onClick}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring/50 flex h-8 max-w-full items-center gap-1.5 self-start rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-3 active:scale-95",
        product ? "text-foreground" : "text-muted-foreground border-dashed",
      )}
    >
      {product ? (
        <>
          <span aria-hidden="true">{productFamilyEmoji(product.family)}</span>
          <span className="truncate">{product.kind}</span>
        </>
      ) : (
        <span className="truncate">{pendingLabel}</span>
      )}
      <Pencil className="size-3 shrink-0 opacity-60" aria-hidden="true" />
    </button>
  );
}

/**
 * The two fields a class is made of: the fixed family, the free kind. Raw
 * values — the caller decides when they make a class (both set) and the
 * kind is normalized where it is stored.
 */
export function ProductClassFields({
  idPrefix,
  family,
  kind,
  onChange,
  disabled,
}: {
  idPrefix: string;
  family: ProductFamilyId | null;
  kind: string;
  onChange: (next: { family: ProductFamilyId | null; kind: string }) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${idPrefix}-family`} className="text-xs">
          {t("products.family")}
        </Label>
        <Select
          id={`${idPrefix}-family`}
          value={family ?? ""}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              family: isProductFamilyId(event.target.value) ? event.target.value : null,
              kind,
            })
          }
        >
          <option value="">–</option>
          {PRODUCT_FAMILY_IDS.map((id) => (
            <option key={id} value={id}>
              {productFamilyEmoji(id)} {t(productFamilyLabelKey(id))}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`${idPrefix}-kind`} className="text-xs">
          {t("products.kind")}
        </Label>
        <Input
          id={`${idPrefix}-kind`}
          value={kind}
          maxLength={MAX_PRODUCT_KIND_LENGTH}
          placeholder={t("products.kindPlaceholder")}
          disabled={disabled}
          onChange={(event) => onChange({ family, kind: event.target.value })}
        />
      </div>
    </div>
  );
}
