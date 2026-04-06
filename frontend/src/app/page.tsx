import { redirect } from "next/navigation";
import { todayBeirutIsoDate } from "@/lib/beirut-date";

/** Évite un redirect `/` mis en cache avec une date périmée (logo « retour accueil »). */
export const dynamic = "force-dynamic";

/** Accueil : redirection vers l’édition du jour (date Beyrouth). */
export default function HomePage() {
  redirect(`/edition/${todayBeirutIsoDate()}`);
}
