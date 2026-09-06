"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icons";
import { PhotoSlot } from "@/components/ui/photo-slot";
import { BackLink } from "@/components/domain/renter-header";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { markConversationRead, sendMessage } from "@/app/(renter)/actions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface ThreadMessage {
  id: string;
  sender_side: string;
  kind: string;
  body: string | null;
  photo_url: string | null;
  read_at: string | null;
  created_at: string;
  sender_name: string | null;
}

interface Props {
  conversationId: string;
  side: "renter" | "provider";
  me: { id: string; name: string };
  provider: { name: string; short: string; responseMinutes: number | null; ownerName: string | null };
  renterName: string;
  booking: { ref: string; status: string; statusLabel: string | null; endAt: string | null } | null;
  listing: { title: string | null; slug: string | null; coverUrl: string | null };
  messages: ThreadMessage[];
}

const QUICK = ["Running 10 min late", "Where do I leave it?"];

/** M13 thread: booking context pinned, system events inline, quick replies, photo messages. Live via Supabase Realtime (inserts on `messages`) when configured, with a 15 s poll in demo mode. */
export function Thread({ conversationId, side, me, provider, renterName, booking, listing, messages }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<ThreadMessage[]>([]);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const other = side === "renter" ? provider.name : renterName;

  useEffect(() => {
    void markConversationRead(conversationId, side);
    const sb = getSupabaseBrowserClient();
    // `messages` is in the supabase_realtime publication; RLS scopes the stream to this user's conversations
    const channel = sb
      ?.channel(`thread:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => router.refresh())
      .subscribe();
    const t = setInterval(() => router.refresh(), channel ? 60_000 : 15_000);
    return () => {
      clearInterval(t);
      if (sb && channel) void sb.removeChannel(channel);
    };
  }, [conversationId, side, router]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, optimistic.length]);

  const all = [...messages, ...optimistic.filter((o) => !messages.some((m) => m.body === o.body && Math.abs(new Date(m.created_at).getTime() - new Date(o.created_at).getTime()) < 60_000))];

  const send = (text: string, photoPath?: string) =>
    start(async () => {
      const body = text.trim();
      if (!body && !photoPath) return;
      setOptimistic((o) => [...o, { id: `tmp-${Date.now()}`, sender_side: side, kind: photoPath ? "photo" : "text", body: body || null, photo_url: null, read_at: null, created_at: new Date().toISOString(), sender_name: me.name }]);
      setDraft("");
      const r = await sendMessage(conversationId, body, photoPath);
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        setOptimistic((o) => o.slice(0, -1));
        return;
      }
      router.refresh();
    });

  const upload = async (f: File) => {
    const fd = new FormData();
    fd.set("bucket", "condition-photos");
    fd.set("path", `messages/${conversationId}`);
    fd.set("file", f);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      toast({ title: "Couldn't upload that photo", tone: "error" });
      return;
    }
    const { path } = (await res.json()) as { path: string };
    send("", path);
  };

  let lastDay = "";
  const today = formatDate(new Date());
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col lg:min-h-[calc(100vh-64px)] lg:border-x lg:border-border">
      <div className="flex items-center gap-3 border-b border-border px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 lg:px-5 lg:pt-4">
        <BackLink href={side === "renter" ? "/inbox" : "/provider/inbox"} />
        <Avatar name={other} size={40} tone={side === "renter" ? "charcoal" : "cobalt"} />
        <div className="min-w-0 flex-1">
          <div className="truncate-1 text-[15px] font-bold">{other}</div>
          <div className="truncate-1 text-[12px] text-text-3">{side === "renter" ? (provider.responseMinutes ? `Replies in ~${provider.responseMinutes} min` : "Usually replies within the hour") : "Renter"}</div>
        </div>
      </div>
      {(booking || listing.title) && (
        <Link href={booking ? (side === "renter" ? `/rentals/${booking.ref}` : `/provider/bookings/${booking.ref}`) : `/listings/${listing.slug}`} className="mx-4 mt-3 flex items-center gap-3 rounded-panel border border-border bg-white px-3 py-2.5 text-charcoal no-underline hover:bg-ivory/60 lg:mx-5">
          <div className="relative size-10 flex-none overflow-hidden rounded-[8px]"><PhotoSlot src={listing.coverUrl} placeholder="" className="absolute inset-0" /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate-1 text-[13px] font-bold">{listing.title ?? "Listing"}</div>
            <div className="truncate-1 t-mono text-[11px] text-text-3">{booking ? `${booking.ref}${booking.statusLabel ? ` · ${booking.statusLabel}` : ""}${booking.endAt ? ` · due ${formatDateTime(new Date(booking.endAt)).replace(" · ", " ")}` : ""}` : "Enquiry before booking"}</div>
          </div>
          <Icon name="chevron-right" size={16} className="text-text-3" />
        </Link>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pt-4 pb-3 lg:px-5">
        {all.length === 0 && <div className="py-10 text-center text-[13px] text-text-3">Say hello — {provider.short} usually replies quickly.</div>}
        {all.map((m) => {
          const at = new Date(m.created_at);
          const day = formatDate(at);
          const divider = day !== lastDay ? <div key={`d-${m.id}`} className="my-2 text-center text-[11px] font-semibold text-text-3">{day === today ? `Today, ${day}` : day}</div> : null;
          lastDay = day;
          const mine = m.sender_side === side;
          if (m.kind === "system") {
            return (
              <div key={m.id} className="contents">
                {divider}
                <div className="my-1 flex justify-center"><span className="inline-flex max-w-[92%] items-center gap-1.5 rounded-pill bg-ivory-deep px-3 py-1.5 text-center text-[12px] font-semibold text-text-2"><Icon name="info" size={12} />{m.body}</span></div>
              </div>
            );
          }
          const who = mine ? null : m.sender_name ? (side === "renter" ? `${m.sender_name.split(" ")[0]} at ${provider.short}` : m.sender_name.split(" ")[0]) : side === "renter" ? provider.short : renterName.split(" ")[0];
          return (
            <div key={m.id} className="contents">
              {divider}
              <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                <div className={cn("max-w-[82%] rounded-[16px] px-3.5 py-2.5 text-[14px] leading-[1.45]", mine ? "rounded-br-[6px] bg-cobalt text-white" : "rounded-bl-[6px] border border-border bg-white text-charcoal")}>
                  {/* signed, short-lived URL — not optimisable by next/image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {m.photo_url && <img src={m.photo_url} alt="Photo message" className="mb-1.5 max-h-[260px] w-full rounded-[10px] object-cover" />}
                  {m.body}
                </div>
                <div className="text-[11px] text-text-3">{formatTime(at)}{mine ? (m.read_at ? " · Read" : m.id.startsWith("tmp-") ? " · Sending…" : " · Sent") : who ? ` · ${who}` : ""}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 border-t border-border bg-paper px-4 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))] lg:px-5">
        <div className="mb-2.5 flex gap-2 overflow-x-auto scrollbar-none">
          {QUICK.map((q) => <button key={q} type="button" onClick={() => send(q)} className="h-8 flex-none rounded-pill border border-border bg-white px-3 text-[12px] font-semibold text-charcoal hover:border-border-strong">{q}</button>)}
          <button type="button" onClick={() => file.current?.click()} className="flex h-8 flex-none items-center gap-1.5 rounded-pill border border-border bg-white px-3 text-[12px] font-semibold text-charcoal hover:border-border-strong"><Icon name="camera" size={14} />Send a photo</button>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </div>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message ${side === "renter" ? provider.short : renterName.split(" ")[0]}…`} aria-label="Message" className="h-11 flex-1 rounded-pill border border-border-strong bg-white px-4 text-[14px] outline-none focus:border-cobalt" data-testid="composer" />
          <button type="submit" aria-label="Send" disabled={pending || !draft.trim()} className="flex size-11 flex-none items-center justify-center rounded-full bg-cobalt text-white disabled:opacity-40"><Icon name="send" size={18} /></button>
        </form>
      </div>
    </div>
  );
}
