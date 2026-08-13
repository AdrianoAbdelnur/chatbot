"use client";

import type { CatalogCompany } from "./MonitoringCatalog.tsx";

export function ManualCheckSelection({ companies, selectedCompanyKeys, selectedVehicleIds, onCompanyToggle, onVehicleToggle, onSubmit, disabled }: {
  companies: CatalogCompany[]; selectedCompanyKeys: string[]; selectedVehicleIds: string[]; onCompanyToggle: (key: string) => void; onVehicleToggle: (id: string) => void; onSubmit: () => void; disabled: boolean;
}) {
  const selected = companies.flatMap((company) => company.vehicles);
  return <section className="rounded-xl border border-cyan-900/50 bg-cyan-950/30 p-4" aria-labelledby="manual-check-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">One-shot inspection</p><h2 id="manual-check-title" className="mt-1 text-lg font-semibold text-slate-100">Manual check</h2></div><button type="button" onClick={onSubmit} disabled={disabled || (selectedCompanyKeys.length === 0 && selectedVehicleIds.length === 0)} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Run selected check</button></div>
    <div className="mt-4 flex flex-wrap gap-2">{companies.map((company) => <label key={company.companyKey} className="rounded-full border border-slate-700 px-3 py-1.5 text-sm text-slate-200"><input type="checkbox" checked={selectedCompanyKeys.includes(company.companyKey)} onChange={() => onCompanyToggle(company.companyKey)} className="mr-2 accent-cyan-400" />{company.companyName}</label>)}</div>
    <div className="mt-3 flex flex-wrap gap-2">{selected.map((vehicle) => <label key={vehicle.vehicleId} className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300"><input type="checkbox" checked={selectedVehicleIds.includes(vehicle.vehicleId)} onChange={() => onVehicleToggle(vehicle.vehicleId)} className="mr-2 accent-cyan-400" />{vehicle.plate}</label>)}</div>
  </section>;
}
