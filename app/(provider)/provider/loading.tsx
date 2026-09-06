import { PageSkeleton } from "@/components/ui/states";

export default function Loading() {
  return <PageSkeleton width={1200} cards={4} className="lg:pt-6" />;
}
