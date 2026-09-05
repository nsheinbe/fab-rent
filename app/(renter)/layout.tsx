import { BottomTabBar } from "@/components/domain/bottom-tab-bar";

export default function RenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col pb-[76px] lg:pb-0">
      {children}
      <BottomTabBar />
    </div>
  );
}
