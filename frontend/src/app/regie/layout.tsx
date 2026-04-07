import { RegieNav } from "@/components/layout/regie-nav";

export default function RegieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[72rem] space-y-8">
      <RegieNav />
      <div className="space-y-6">{children}</div>
    </div>
  );
}
