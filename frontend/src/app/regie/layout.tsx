import Link from "next/link";

export default function RegieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-3">
        <p className="olj-rubric">Régie technique</p>
        <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
          <Link href="/regie" className="hover:text-foreground hover:underline">
            Accueil régie
          </Link>
          <Link href="/regie/sources" className="hover:text-foreground hover:underline">
            Sources
          </Link>
          <Link href="/regie/pipeline" className="hover:text-foreground hover:underline">
            Pipeline
          </Link>
          <Link href="/regie/dedup" className="hover:text-foreground hover:underline">
            Dédup
          </Link>
          <Link href="/regie/clustering" className="hover:text-foreground hover:underline">
            Clustering
          </Link>
          <Link href="/regie/curator" className="hover:text-foreground hover:underline">
            Curateur
          </Link>
          <Link href="/regie/logs" className="hover:text-foreground hover:underline">
            Logs
          </Link>
          <Link href="/dashboard" className="hover:text-foreground hover:underline">
            Sujets du jour
          </Link>
          <Link href="/articles" className="hover:text-foreground hover:underline">
            Articles
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
