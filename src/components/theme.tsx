"use client";
import { useEffect } from "react";

/** Aplica o tema salvo no perfil ("system" usa a preferência do aparelho). */
export function ThemeApplier({ theme }: { theme: string }) {
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "light" || theme === "dark") el.setAttribute("data-theme", theme);
    else el.removeAttribute("data-theme");
  }, [theme]);
  return null;
}
