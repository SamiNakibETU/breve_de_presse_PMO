import Link from "next/link";

export default function RegieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="border-b border-[#dddcda] pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888]">
          Régie technique
        </p>
        <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
          <Link href="/regie" className="hover:underline">
            Accueil régie
          </Link>
          <Link href="/regie/sources" className="hover:underline">
            Sources
          </Link>
          <Link href="/regie/pipeline" className="hover:underline">
            Pipeline
          </Link>
          <Link href="/regie/dedup" className="hover:underline">
            Dédup
          </Link>
          <Link href="/regie/clustering" className="hover:underline">
            Clustering
          </Link>
          <Link href="/regie/curator" className="hover:underline">
            Curateur
          </Link>
          <Link href="/regie/logs" className="hover:underline">
            Logs
          </Link>
          <Link href="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          <Link href="/articles" className="hover:underline">
            Articles
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
