"use client";

import { redirect } from "next/navigation";
import { todayBeirutIsoDate } from "@/lib/beirut-date";

/**
 * /edition → redirige vers l'édition d'aujourd'hui (Asia/Beirut).
 */
export default function EditionIndexPage() {
  redirect(`/edition/${todayBeirutIsoDate()}`);
}
