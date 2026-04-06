import { redirect } from "next/navigation";

/** Ancienne URL : la vue régionale vit sous `/panorama`. */
export default function DashboardRedirectPage() {
  redirect("/panorama");
}
