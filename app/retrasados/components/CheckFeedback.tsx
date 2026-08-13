"use client";

export function CheckFeedback({ message, error }: { message?: string; error?: string }) {
  if (!message && !error) return null;
  return <p role={error ? "alert" : "status"} className={error ? "rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900" : "rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"}>{error ?? message}</p>;
}
