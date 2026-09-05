import { RenterShell } from "@/components/domain/renter-shell";

export default function RenterLayout({ children }: { children: React.ReactNode }) {
  return <RenterShell>{children}</RenterShell>;
}
