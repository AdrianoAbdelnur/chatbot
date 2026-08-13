"use client";

import type { ReactNode } from "react";

export function IncidentTable({ children }: { children: ReactNode }) {
  return <section aria-labelledby="incident-table-title"><h2 id="incident-table-title" className="sr-only">Active incidents</h2>{children}</section>;
}
