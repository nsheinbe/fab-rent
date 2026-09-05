"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function BackButton({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <button type="button" aria-label="Back" className={className} onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
      {children}
    </button>
  );
}
