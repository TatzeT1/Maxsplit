"use client";

import { LogOut, ShieldCheck, User, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { LanguageToggle } from "@/components/language-toggle";
import { useSignOut } from "@/components/sign-out-button";
import { useT } from "@/components/locale-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function AppSidebar({
  displayName,
  isAdmin,
}: {
  displayName: string | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-6">
        <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
          <SidebarLogo />
          <SidebarNavLinks isAdmin={isAdmin} />
        </div>
        <SidebarFooter displayName={displayName} />
      </SidebarBody>
    </Sidebar>
  );
}

function SidebarLogo() {
  const { open, animate, setOpen } = useSidebar();
  const t = useT();

  return (
    <Link
      href="/groups"
      onClick={() => setOpen(false)}
      aria-label={t("app.name")}
      className="relative z-20 flex items-center gap-2 px-2 py-1"
    >
      <span className="shadow-primary/30 flex size-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-orange-400 to-rose-500 text-white shadow-sm">
        <Wallet className="size-4" />
      </span>
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="font-heading text-sidebar-foreground !m-0 inline-block !p-0 text-lg font-semibold whitespace-pre"
      >
        {t("app.name")}
      </motion.span>
    </Link>
  );
}

function SidebarNavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const t = useT();

  const links = [
    {
      label: t("nav.groups"),
      href: "/groups",
      icon: <Users className="size-5 shrink-0" />,
      active: pathname === "/groups" || pathname.startsWith("/groups/"),
    },
    {
      label: t("nav.profile"),
      href: "/profile",
      icon: <User className="size-5 shrink-0" />,
      active: pathname === "/profile",
    },
    ...(isAdmin
      ? [
          {
            label: t("nav.admin"),
            href: "/admin",
            icon: <ShieldCheck className="size-5 shrink-0" />,
            active: pathname === "/admin" || pathname.startsWith("/admin/"),
          },
        ]
      : []),
  ];

  return (
    <div className="mt-8 flex flex-col gap-1">
      {links.map((link) => (
        <SidebarLink key={link.href} link={link} />
      ))}
    </div>
  );
}

function SidebarFooter({ displayName }: { displayName: string | null }) {
  const { open, animate, setOpen } = useSidebar();
  const { signOut, loading } = useSignOut();
  const t = useT();

  return (
    <div className="border-sidebar-border flex flex-col gap-3 border-t pt-4">
      {displayName && (
        <motion.p
          animate={{
            display: animate ? (open ? "block" : "none") : "block",
            opacity: animate ? (open ? 1 : 0) : 1,
          }}
          className="text-sidebar-foreground/60 truncate px-2 text-xs whitespace-pre"
        >
          {displayName}
        </motion.p>
      )}
      <div className={cn("flex gap-2 px-1", open ? "flex-row items-center" : "flex-col items-start")}>
        <LanguageToggle size="icon-lg" />
        <ThemeToggle size="icon-lg" />
      </div>
      <button
        type="button"
        disabled={loading}
        aria-label={t("nav.signOut")}
        onClick={() => {
          setOpen(false);
          void signOut();
        }}
        className="group/sidebar text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground touch-manipulation flex items-center justify-start gap-3 rounded-lg px-2 py-2 transition-colors disabled:opacity-50"
      >
        <LogOut className="size-5 shrink-0" />
        <motion.span
          animate={{
            display: animate ? (open ? "inline-block" : "none") : "inline-block",
            opacity: animate ? (open ? 1 : 0) : 1,
          }}
          className="!m-0 inline-block !p-0 text-sm whitespace-pre"
        >
          {t("nav.signOut")}
        </motion.span>
      </button>
    </div>
  );
}
