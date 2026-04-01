import { redirect } from "next/navigation";

/** Ancien lien « Panorama » : redirection vers le tableau de bord régional. */
export default function PanoramaRedirectPage() {
  redirect("/dashboard");
}
