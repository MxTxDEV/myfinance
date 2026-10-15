"use client";
import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
