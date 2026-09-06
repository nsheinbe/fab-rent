"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/pill";
import { StarRating } from "@/components/ui/star-rating";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { submitReview } from "@/app/(renter)/actions";

const TAGS = ["As described", "Clean & ready", "Easy handoff", "Fair on return", "Slow replies"];

/** M14: item and provider rated separately, tag chips, optional photos; published double-blind. */
export function ReviewForm({ bookingRef, providerName, providerShort }: { bookingRef: string; providerName: string; providerShort: string }) {
  const [item, setItem] = useState(0);
  const [prov, setProv] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<Array<{ path: string; url: string }>>([]);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  const upload = async (f: File) => {
    const fd = new FormData();
    fd.set("bucket", "evidence");
    fd.set("path", `reviews/${bookingRef}`);
    fd.set("file", f);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      toast({ title: "Couldn't upload that photo", tone: "error" });
      return;
    }
    const j = (await res.json()) as { path: string; url: string };
    setPhotos((p) => [...p, j].slice(0, 6));
  };

  const submit = () =>
    start(async () => {
      const r = await submitReview({ ref: bookingRef, item_stars: item, provider_stars: prov, tags, body, photos: photos.map((p) => p.path) });
      if (!r.ok) {
        toast({ title: r.error, tone: "error" });
        return;
      }
      toast({ title: "Thanks for the review", description: `It's published once ${providerShort} has also reviewed you, or after 14 days.`, tone: "ok" });
      router.push("/rentals?tab=past");
    });

  return (
    <div className="flex flex-col gap-4 px-5 pt-5 pb-10 lg:px-6">
      <div className="card-sm flex items-center justify-between gap-4 px-4 py-3.5">
        <div><div className="text-[14px] font-bold">The item</div><div className="text-[12px] text-text-3">Condition, accuracy of the listing</div></div>
        <StarRating value={item} onChange={setItem} size={26} aria-label="Item rating" />
      </div>
      <div className="card-sm flex items-center justify-between gap-4 px-4 py-3.5">
        <div><div className="text-[14px] font-bold">{providerShort}</div><div className="text-[12px] text-text-3">Communication, handoff, fairness</div></div>
        <StarRating value={prov} onChange={setProv} size={26} aria-label="Provider rating" />
      </div>
      <div className="flex flex-wrap gap-2">
        {TAGS.map((t) => <Chip key={t} selected={tags.includes(t)} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>{t}</Chip>)}
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder={`What should the next renter know? How was ${providerName}?`} aria-label="Review" maxLength={2000} />
      <div className="flex flex-wrap gap-2">
        {/* user uploads come from signed, short-lived URLs — next/image can't optimise them */}
        {photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.path} src={p.url} alt="" className="size-16 rounded-[10px] object-cover" />
        ))}
        {photos.length < 6 && <button type="button" onClick={() => file.current?.click()} className="flex h-16 items-center gap-2 rounded-[10px] border border-dashed border-border-strong px-3.5 text-[13px] font-semibold text-charcoal hover:bg-ivory"><Icon name="camera" size={16} />Add photo</button>}
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
      </div>
      <Button size="xl" block className="!rounded-[12px] mt-2" onClick={submit} loading={pending} disabled={item === 0 || prov === 0} data-testid="submit-review">Submit review</Button>
      <p className="text-center text-[12px] leading-[1.5] text-text-3">Published once {providerShort} has also reviewed you, or after 14 days. Your name shows as first name and initial.</p>
    </div>
  );
}
