"use client";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { demoSignIn, oauthSignIn, sendOtp, verifyOtp } from "./actions";

export function AuthForm({ next, error, demo, accounts }: { next: string; error?: string; demo: boolean; accounts: Array<{ id: string; name: string; email: string; role: string }> }) {
  const [mode, setMode] = useState<"buttons" | "otp" | "accounts">("buttons");
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState<{ identifier: string; demoCode: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(error === "unknown" ? "We couldn't find that account." : error === "oauth" ? "Sign-in was cancelled. Try again." : null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.set("identifier", identifier);
      const r = await sendOtp(fd);
      if (!r.ok) setErr(r.error);
      else setSent({ identifier: r.identifier, demoCode: r.demoCode });
    });
  const verify = () =>
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.set("identifier", sent!.identifier);
      fd.set("code", code);
      fd.set("name", name);
      fd.set("next", next);
      const r = await verifyOtp(fd);
      if (r && !r.ok) setErr(r.error);
    });

  return (
    <div className="mt-5 flex flex-col gap-2.5">
      {mode === "buttons" && (
        <>
          <form action={oauthSignIn}>
            <input type="hidden" name="provider" value="apple" />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="dark" size="xl" block className="!rounded-[12px]" leading={<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.5-3.7zM14.1 5.8c.6-.8 1.1-1.8.9-2.8-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.3z" /></svg>}>Continue with Apple</Button>
          </form>
          <form action={oauthSignIn}>
            <input type="hidden" name="provider" value="google" />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="secondary" size="xl" block className="!rounded-[12px]" leading={<span className="size-4 rounded-full" style={{ background: "conic-gradient(#EA4335 0 25%,#FBBC05 0 50%,#34A853 0 75%,#4285F4 0)" }} aria-hidden />}>Continue with Google</Button>
          </form>
          <Button variant="secondary" size="xl" block className="!rounded-[12px]" onClick={() => setMode("otp")}>Continue with email or phone</Button>
          {demo && accounts.length > 0 && <button type="button" onClick={() => setMode("accounts")} className="mt-1 text-[13px] font-semibold text-cobalt">Demo · sign in as a seeded account</button>}
        </>
      )}
      {mode === "otp" && (
        <div className="flex flex-col gap-3">
          {!sent ? (
            <>
              <Field label="Email or phone" id="identifier">
                <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" onKeyDown={(e) => e.key === "Enter" && send()} />
              </Field>
              <Button size="xl" block className="!rounded-[12px]" onClick={send} loading={pending} disabled={identifier.trim().length < 3}>Send code</Button>
            </>
          ) : (
            <>
              <div className="text-[13px] text-text-2">We sent a 6-digit code to <b className="text-charcoal">{sent.identifier}</b>.{sent.demoCode && <> <span className="rounded-[6px] bg-warn-bg px-1.5 py-0.5 text-[12px] font-semibold text-warn-text">Demo · your code is <span className="t-mono" data-testid="demo-otp">{sent.demoCode}</span></span></>}</div>
              <Field label="Code" id="code">
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" mono className="tracking-[.2em]" />
              </Field>
              <Field label="Your name" id="name" hint="new accounts only">
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Nair" autoComplete="name" />
              </Field>
              <Button size="xl" block className="!rounded-[12px]" onClick={verify} loading={pending} disabled={code.length !== 6}>Continue</Button>
              <button type="button" onClick={() => { setSent(null); setCode(""); }} className="text-[13px] font-semibold text-cobalt">Use a different email or phone</button>
            </>
          )}
          <button type="button" onClick={() => { setMode("buttons"); setErr(null); }} className="text-[13px] font-semibold text-text-3">Back</button>
        </div>
      )}
      {mode === "accounts" && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] text-text-3">Demo mode — no Supabase Auth configured. Pick an account; every role is represented.</div>
          <div className="card-sm overflow-hidden rounded-panel">
            {accounts.map((a, i) => (
              <form key={a.id} action={demoSignIn} className={cn(i < accounts.length - 1 && "border-b border-border")}>
                <input type="hidden" name="email" value={a.email} />
                <input type="hidden" name="next" value={next} />
                <button type="submit" className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-ivory" data-testid={`demo-account-${a.email}`}>
                  <Avatar name={a.name} size={32} tone={a.role.startsWith("Staff") ? "light" : a.role.startsWith("Provider") ? "charcoal" : "cobalt"} />
                  <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{a.name}</div><div className="text-[11px] text-text-3">{a.role} · {a.email}</div></div>
                </button>
              </form>
            ))}
          </div>
          <button type="button" onClick={() => setMode("buttons")} className="text-[13px] font-semibold text-text-3">Back</button>
        </div>
      )}
      {err && <div role="alert" className="rounded-control bg-error-bg px-3 py-2 text-[13px] font-semibold text-error-text">{err}</div>}
      <p className="mt-2 text-center text-[12px] leading-[1.5] text-text-3">By continuing you agree to fab.rent&apos;s Terms and Privacy Policy.</p>
    </div>
  );
}
