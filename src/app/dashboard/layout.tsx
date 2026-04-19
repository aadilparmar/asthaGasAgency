import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full max-w-full overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 md:ml-60 p-4 pt-14 md:pt-5 md:p-5 bg-slate-50 min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
