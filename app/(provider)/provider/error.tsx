"use client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

/** Provider console error boundary: rendered inside the shell so navigation keeps working. */
export default function ProviderError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <ErrorState
        title="Something went wrong"
        body={error.digest ? `We've logged it (reference ${error.digest}). Try again in a moment.` : error.message}
        action={
          <div className="flex gap-2">
            <Button size="md" onClick={reset}>Try again</Button>
            <Button size="md" variant="secondary" href="/provider">Dashboard</Button>
          </div>
        }
        className="w-full max-w-[420px]"
      />
    </div>
  );
}
