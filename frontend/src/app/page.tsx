import { redirect } from "next/navigation";
import { todayBeirutIsoDate } from "@/lib/beirut-date";

/** Évite un redirect `/` mis en cache avec une date périmée (logo « retour accueil »). */
export const dynamic = "force-dynamic";

/** MEMW v2 : entrée produit → Sommaire de l’édition du jour (Beyrouth). */
export default function HomePage() {
  redirect(`/edition/${todayBeirutIsoDate()}`);
}
