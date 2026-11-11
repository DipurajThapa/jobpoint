"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import PublicEnquiryDialog from "./public-enquiry-dialog";

type Audience = "candidate" | "employer";
const Registration = createContext<(audience: Audience) => void>(() => {});
export const useRegistration = () => useContext(Registration);

/** One dialog instance for all public registration entry points, including legacy URLs. */
export default function RegistrationProvider({ children }: { children: ReactNode }) {
  const [audience, setAudience] = useState<Audience | null>(null);
  const open = useCallback((kind: Audience) => setAudience(kind), []);
  const close = useCallback(() => setAudience(null), []);
  useEffect(() => {
    const initial = new URL(window.location.href);
    if (initial.pathname === "/portal/register") open(initial.searchParams.get("kind") === "company" ? "employer" : "candidate");
    const follow = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== "/portal/register") return;
      event.preventDefault(); open(url.searchParams.get("kind") === "company" ? "employer" : "candidate");
    };
    document.addEventListener("click", follow);
    return () => document.removeEventListener("click", follow);
  }, [open]);
  return <Registration.Provider value={open}>{children}{audience && <div className={`theme-wrap theme-${audience === "employer" ? "company" : "candidate"}`}><PublicEnquiryDialog key={audience} type={audience} onClose={close} /></div>}</Registration.Provider>;
}
