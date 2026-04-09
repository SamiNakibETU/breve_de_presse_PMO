import Link from "next/link";
import { todayBeirutIsoDate } from "@/lib/beirut-date";

export default function NotFound() {
  const todayHref = `/edition/${todayBeirutIsoDate()}`;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-neutral-400">
        Page introuvable
      </p>
      <h1 className="text-4xl font-bold tracking-tight">404</h1>
      <p className="max-w-sm text-neutral-500">
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <div className="flex gap-3">
        <Link
          href={todayHref}
          className="rounded-md bg-[#dd3b31] px-4 py-2 text-sm font-medium text-white hover:bg-[#c4342b] transition-colors"
        >
          Édition du jour
        </Link>
        <Link
          href="/panorama"
          className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          Panorama
        </Link>
      </div>
    </div>
  );
}
