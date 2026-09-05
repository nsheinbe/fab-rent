import { Button } from "@/components/ui/button";
import { Logo } from "@/components/domain/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <Logo size={28} href={null} />
      <h1 className="t-title">This page has been returned</h1>
      <p className="max-w-[360px] text-[14px] text-text-2">We couldn&apos;t find what you were looking for. It may have been removed or the link is out of date.</p>
      <Button href="/">Back to Explore</Button>
    </main>
  );
}
