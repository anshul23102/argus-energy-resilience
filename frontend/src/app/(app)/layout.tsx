import AppShell from "@/components/AppShell";
import { NetworkDataProvider } from "@/lib/useNetworkData";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <NetworkDataProvider>
      <AppShell>{children}</AppShell>
    </NetworkDataProvider>
  );
}
