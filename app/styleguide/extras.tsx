"use client";
import { useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { Stepper } from "@/components/ui/stepper";
import { Switch, Checkbox, Slider } from "@/components/ui/controls";
import { SegmentedControl } from "@/components/ui/tabs";
import { StarRating } from "@/components/ui/star-rating";
import { Avatar } from "@/components/ui/avatar";
import { Timeline } from "@/components/ui/timeline";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { DialogRoot, DialogTrigger, DialogContent, SheetContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function StyleguideExtras() {
  const [qty, setQty] = useState(1);
  const [on, setOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [seg, setSeg] = useState<"any" | "pickup" | "delivery">("any");
  const [range, setRange] = useState([12, 62]);
  const [stars, setStars] = useState(4);
  const toast = useToast();
  return (
    <div className="flex flex-col gap-4">
      <Field label="Delivery address" id="sg-address">
        <Input id="sg-address" defaultValue="18 Corrin St, Vesper Hill" />
      </Field>
      <Input placeholder="Focused · placeholder text" aria-label="Placeholder" />
      <div className="flex flex-wrap items-center gap-4">
        <Stepper value={qty} onChange={setQty} min={1} max={3} aria-label="Quantity" />
        <Switch checked={on} onCheckedChange={setOn} aria-label="Toggle" />
        <Checkbox checked={checked} onCheckedChange={setChecked} aria-label="Checkbox" />
        <StarRating value={stars} onChange={setStars} />
        <Avatar name="Priya Nair" tone="cobalt" />
        <Avatar name="Northlands Tool & Hire" tone="charcoal" />
      </div>
      <SegmentedControl value={seg} onChange={setSeg} options={[{ value: "any", label: "Any" }, { value: "pickup", label: "Pickup" }, { value: "delivery", label: "Delivery" }]} />
      <Slider value={range} onValueChange={setRange} min={0} max={100} aria-label="Price per day" />
      <Timeline steps={[{ title: "Booked & paid $133.30", meta: "Wed 2 Sep · Visa •••• 4421", state: "done" }, { title: "Delivered · condition recorded", meta: "Sat 5 Sep 08:40 · 6 photos", state: "done" }, { title: "In use — return due Sun 6 Sep, 10:00", state: "current" }, { title: "Return check-in & inspection", state: "upcoming" }]} />
      <Calendar month={new Date(2026, 8, 1)} today={new Date(2026, 8, 5)} range={{ start: new Date(2026, 8, 11), end: new Date(2026, 8, 13) }} isBooked={(d) => [7, 8, 9, 21, 22].includes(d.getDate())} />
      <div className="flex flex-wrap gap-2.5">
        <DialogRoot>
          <DialogTrigger asChild><Button size="md" variant="secondary">Open dialog</Button></DialogTrigger>
          <DialogContent title="Change unit" description="Pick another unit for this booking." footer={<><Button size="md" variant="secondary">Cancel</Button><Button size="md">Assign</Button></>}>
            <div className="text-[14px] text-text-2">Units 1 and 3 are free for Fri 11 – Sun 13 Sep.</div>
          </DialogContent>
        </DialogRoot>
        <DialogRoot>
          <DialogTrigger asChild><Button size="md" variant="secondary">Open sheet</Button></DialogTrigger>
          <SheetContent title="Filters" action={<Button variant="text" size="sm">Reset</Button>} footer={<Button size="xl" block>Show 18 items</Button>}>
            <div className="text-[14px] text-text-2">Sheet content · result count updates live.</div>
          </SheetContent>
        </DialogRoot>
        <Button size="md" variant="ghost" onClick={() => toast({ title: "Saved to your list", description: "DeWalt DWE7491 table saw", tone: "ok" })}>Toast</Button>
      </div>
    </div>
  );
}
