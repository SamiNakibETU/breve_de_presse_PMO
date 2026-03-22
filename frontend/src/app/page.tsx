import { redirect } from "next/navigation";
import { todayBeirutIsoDate } from "@/lib/beirut-date";

/** MEMW v2 : entrée produit → Sommaire de l’édition du jour (Beyrouth). */
export default function HomePage() {
  redirect(`/edition/${todayBeirutIsoDate()}`);
}
