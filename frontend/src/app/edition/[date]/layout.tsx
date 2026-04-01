import type { ReactNode } from "react";
import { EditionDateShell } from "./edition-date-shell";

export default async function EditionDateLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ date: string }>;
}) {
  await params;
  return <EditionDateShell>{children}</EditionDateShell>;
}
