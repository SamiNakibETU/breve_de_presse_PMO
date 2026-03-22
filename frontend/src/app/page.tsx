import { redirect } from "next/navigation";

function todayBeirutIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 10);
}

/** MEMW v2 : entrée produit → Sommaire de l’édition du jour (Beyrouth). */
export default function HomePage() {
  redirect(`/edition/${todayBeirutIso()}`);
}
