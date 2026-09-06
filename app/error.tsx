"use client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <ErrorState title="Something went wrong" body={error.message} action={<Button size="md" onClick={reset}>Try again</Button>} className="w-full max-w-[420px]" />
    </main>
  );
}
