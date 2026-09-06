"use client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

/** Renter-side error boundary: keeps the shell, offers retry + a way home. Sign-in problems point at /auth. */
export default function RenterError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const signIn = /sign in/i.test(error.message);
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <ErrorState
        title={signIn ? "Please sign in" : "Something went wrong"}
        body={signIn ? "This page is only available when you're signed in." : error.digest ? `We've logged it (reference ${error.digest}). Try again in a moment.` : error.message}
        action={
          <div className="flex gap-2">
            {signIn ? <Button size="md" href="/auth">Sign in</Button> : <Button size="md" onClick={reset}>Try again</Button>}
            <Button size="md" variant="secondary" href="/">Back to Explore</Button>
          </div>
        }
        className="w-full max-w-[420px]"
      />
    </div>
  );
}
