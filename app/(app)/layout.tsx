import { Header } from "@/components/Header";
import { ToastProvider } from "@/components/ui/Toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Header />
      <main className="main">{children}</main>
    </ToastProvider>
  );
}
