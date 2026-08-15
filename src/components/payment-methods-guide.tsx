"use client";

import { ChevronDown, ExternalLink, Info, Landmark, Mail, Zap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { useT } from "@/components/locale-provider";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

type MethodTheme = "teal" | "orange" | "rose";

const badgeBg: Record<MethodTheme, string> = {
  teal: "bg-teal-50 dark:bg-teal-500/10",
  orange: "bg-orange-50 dark:bg-orange-500/10",
  rose: "bg-rose-50 dark:bg-rose-500/10",
};
const badgeText: Record<MethodTheme, string> = {
  teal: "text-teal-600 dark:text-teal-400",
  orange: "text-orange-600 dark:text-orange-400",
  rose: "text-rose-600 dark:text-rose-400",
};

type MethodId = "iban" | "paypalEmail" | "paypalMe";

function GuideRow({
  icon: Icon,
  theme,
  title,
  badge,
  summary,
  detail,
  footer,
  isOpen,
  onToggle,
  reduceMotion,
  stagger,
}: {
  icon: typeof Landmark;
  theme: MethodTheme;
  title: string;
  badge?: string;
  summary: string;
  detail: string;
  footer?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  reduceMotion: boolean | null;
  stagger: number;
}) {
  return (
    <li
      className="animate-rise bg-card ring-foreground/10 overflow-hidden rounded-xl ring-1"
      style={{ "--stagger": stagger } as CSSProperties}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-(--duration-fast) outline-none focus-visible:ring-3 active:scale-[0.99]"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            badgeBg[theme],
            badgeText[theme],
          )}
        >
          <Icon className="size-4.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            {title}
            {badge && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  badgeBg[theme],
                  badgeText[theme],
                )}
              >
                {badge}
              </span>
            )}
          </span>
          <span className="text-muted-foreground text-xs">{summary}</span>
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={reduceMotion ? { duration: 0 } : springs.snappy}
          className="text-muted-foreground shrink-0"
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={reduceMotion ? { duration: 0 } : springs.weighted}
        className="overflow-hidden"
      >
        <div className="text-muted-foreground flex flex-col gap-2 px-3 pt-0 pb-3 pl-[3.25rem] text-sm text-pretty">
          <p>{detail}</p>
          {footer}
        </div>
      </motion.div>
    </li>
  );
}

/**
 * Explains what each of the three payout methods is for and how to set it
 * up. Purely informational — reads no payment data of its own, so it stays
 * decoupled from PaymentDetailsForm's live input state. One row starts open
 * (PayPal.Me, the newest and fastest option) so the panel never lands looking
 * like an empty list of collapsed headers.
 */
export function PaymentMethodsGuide() {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [openId, setOpenId] = useState<MethodId | null>("paypalMe");

  function toggle(id: MethodId) {
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="animate-rise flex items-center gap-1.5 text-sm font-medium">
        <Info className="text-muted-foreground h-4 w-4" />
        {t("profile.guideTitle")}
      </div>
      <p
        className="animate-rise text-muted-foreground text-sm"
        style={{ "--stagger": 1 } as CSSProperties}
      >
        {t("profile.guideIntro")}
      </p>
      <ul className="flex flex-col gap-2">
        <GuideRow
          icon={Zap}
          theme="rose"
          title={t("profile.guidePaypalMeTitle")}
          badge={t("profile.guidePaypalMeBadge")}
          summary={t("profile.guidePaypalMeSummary")}
          detail={t("profile.guidePaypalMeDetail")}
          isOpen={openId === "paypalMe"}
          onToggle={() => toggle("paypalMe")}
          reduceMotion={reduceMotion}
          stagger={2}
          footer={
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <code className="bg-muted rounded-md px-2 py-1 text-xs">
                paypal.me/{t("profile.guidePaypalMeExampleHandle")}
              </code>
              <a
                href="https://paypal.me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                {t("profile.guidePaypalMeSetupLink")}
                <ExternalLink className="size-3" />
              </a>
            </div>
          }
        />
        <GuideRow
          icon={Mail}
          theme="orange"
          title={t("profile.guidePaypalEmailTitle")}
          summary={t("profile.guidePaypalEmailSummary")}
          detail={t("profile.guidePaypalEmailDetail")}
          isOpen={openId === "paypalEmail"}
          onToggle={() => toggle("paypalEmail")}
          reduceMotion={reduceMotion}
          stagger={3}
        />
        <GuideRow
          icon={Landmark}
          theme="teal"
          title={t("profile.guideIbanTitle")}
          summary={t("profile.guideIbanSummary")}
          detail={t("profile.guideIbanDetail")}
          isOpen={openId === "iban"}
          onToggle={() => toggle("iban")}
          reduceMotion={reduceMotion}
          stagger={4}
        />
      </ul>
    </div>
  );
}
