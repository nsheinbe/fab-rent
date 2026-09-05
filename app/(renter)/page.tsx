import { Logo } from "@/components/domain/logo";

export default function HomePlaceholder() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <Logo size={32} href={null} />
      <p className="text-text-2">Rent it nearby, for exactly as long as you need.</p>
      <a href="/styleguide" className="text-[13px] font-semibold">Design system →</a>
    </main>
  );
}
