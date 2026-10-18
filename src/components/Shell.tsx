"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Library, LogOut, Settings } from "lucide-react";
import { signOut } from "@/app/actions";
import { ToastProvider } from "./ui";

interface DirtyCtx {
  dirty: boolean;
  setDirty: (v: boolean) => void;
}
const DirtyContext = createContext<DirtyCtx>({ dirty: false, setDirty: () => {} });
export const useDirty = () => useContext(DirtyContext);

export const LEAVE_MESSAGE = "Tem alterações por guardar. Sair sem guardar?";

const NAV = [
  { href: "/", label: "Coleção", icon: Library, match: (p: string) => p === "/" || p.startsWith("/cartas") },
  { href: "/resumo", label: "Resumo", icon: BarChart3, match: (p: string) => p.startsWith("/resumo") },
  { href: "/definicoes", label: "Definições", icon: Settings, match: (p: string) => p.startsWith("/definicoes") },
];

export function Shell({ appName, children }: { appName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const guard = (e: React.MouseEvent) => {
    if (dirty && !window.confirm(LEAVE_MESSAGE)) e.preventDefault();
    else if (dirty) setDirty(false);
  };

  return (
    <DirtyContext.Provider value={{ dirty, setDirty }}>
      <ToastProvider>
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Saltar para o conteúdo
        </a>

        {/* Navegação compacta — computador */}
        <nav aria-label="Principal" className="fixed inset-y-0 left-0 z-30 hidden w-[84px] flex-col items-center gap-1 border-r border-line bg-white py-4 md:flex">
          <Link href="/" onClick={guard} className="mb-3 grid size-10 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-ink" title={appName} aria-label={`${appName} — início`}>
            {appName.trim().charAt(0).toUpperCase() || "C"}
          </Link>
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                onClick={guard}
                aria-current={active ? "page" : undefined}
                className={`flex w-[68px] flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium ${active ? "bg-accent-soft text-accent" : "text-muted hover:bg-black/5 hover:text-ink"}`}
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </Link>
            );
          })}
          <form action={signOut} className="mt-auto">
            <button className="flex w-[68px] flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium text-muted hover:bg-black/5 hover:text-ink" onClick={(e) => { if (dirty && !window.confirm(LEAVE_MESSAGE)) e.preventDefault(); }}>
              <LogOut aria-hidden className="size-5" />
              Sair
            </button>
          </form>
        </nav>

        {/* Navegação — telemóvel */}
        <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                onClick={guard}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
              >
                <Icon aria-hidden className="size-6" />
                {label}
              </Link>
            );
          })}
        </nav>

        <main id="conteudo" className="px-4 pb-24 pt-5 md:pb-10 md:pl-[108px] md:pr-8 md:pt-7">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </ToastProvider>
    </DirtyContext.Provider>
  );
}
