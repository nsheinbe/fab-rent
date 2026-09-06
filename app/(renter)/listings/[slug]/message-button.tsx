"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { messageProvider, openConversation } from "@/app/(renter)/actions";
import { useToast } from "@/components/ui/toast";

/** "Message {provider}" — opens (or creates) the thread; signed-out renters are sent to sign in first. */
export function MessageProviderButton({ listingSlug, bookingRef, children, ...rest }: { listingSlug?: string; bookingRef?: string; children: React.ReactNode } & Omit<ButtonProps, "onClick" | "children">) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      {...rest}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = bookingRef ? await openConversation(bookingRef) : await messageProvider(listingSlug!);
          if (!r.ok) {
            if (r.code === "unauthenticated") router.push(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
            else toast({ title: r.error, tone: "error" });
            return;
          }
          router.push(`/inbox/${r.data.id}`);
        })
      }
    >
      {children}
    </Button>
  );
}
