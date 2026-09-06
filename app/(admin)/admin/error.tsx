"use client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

/** Admin console error boundary: rendered inside the shell so navigation keeps working. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <ErrorState
        title="Something went wrong"
        body={error.digest ? `We've logged it (reference ${error.digest}). Try again in a moment.` : error.message}
        action={
          <div className="flex gap-2">
            <Button size="md" onClick={reset}>Try again</Button>
            <Button size="md" variant="secondary" href="/admin">Overview</Button>
          </div>
        }
        className="w-full max-w-[420px]"
      />
    </div>
  );
}
