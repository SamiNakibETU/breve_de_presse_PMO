import { RegieNav } from "@/components/layout/regie-nav";

export default function RegieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <RegieNav />
      {children}
    </div>
  );
}
