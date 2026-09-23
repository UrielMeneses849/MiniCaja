"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => undefined);
  }, []);
  return null;
}
