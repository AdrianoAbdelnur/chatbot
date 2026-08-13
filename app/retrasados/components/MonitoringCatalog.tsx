"use client";

export type CatalogVehicle = { vehicleId: string; plate: string; companyKey: string; enabled: boolean; present: boolean; identityStatus: string };
export type CatalogCompany = { companyKey: string; companyName: string; vehicles: CatalogVehicle[] };

export function MonitoringCatalog({ companies, selectedCompanyKey, onCompanyChange, onMembershipChange }: {
  companies: CatalogCompany[];
  selectedCompanyKey: string;
  onCompanyChange: (companyKey: string) => void;
  onMembershipChange: (vehicle: CatalogVehicle, enabled: boolean) => void;
}) {
  const selected = companies.find((company) => company.companyKey === selectedCompanyKey);
  return <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-100 shadow-xl md:grid-cols-[minmax(13rem,0.7fr)_1fr]" aria-labelledby="monitoring-catalog-title">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Registry / live catalog</p>
      <h2 id="monitoring-catalog-title" className="mt-2 text-xl font-semibold">Automatic monitoring</h2>
      <label className="mt-4 block text-sm text-slate-300">Company
        <select value={selectedCompanyKey} onChange={(event) => onCompanyChange(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100">
          <option value="">Select a company</option>
          {companies.map((company) => <option key={company.companyKey} value={company.companyKey}>{company.companyName} · {company.vehicles.length}</option>)}
        </select>
      </label>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      {selected?.vehicles.map((vehicle) => <label key={vehicle.vehicleId} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm">
        <span><span className="block font-mono font-semibold">{vehicle.plate}</span><span className="text-xs text-slate-400">{vehicle.identityStatus === "ok" ? "Identity verified" : "Identity conflict"}</span></span>
        <input type="checkbox" checked={vehicle.enabled} disabled={!vehicle.present || vehicle.identityStatus !== "ok"} onChange={(event) => onMembershipChange(vehicle, event.target.checked)} aria-label={`Automatic monitoring ${vehicle.plate}`} className="h-4 w-4 accent-cyan-400" />
      </label>)}
      {!selected && <p className="rounded-lg border border-dashed border-slate-700 p-6 text-sm text-slate-400">Choose a company to inspect current vehicles.</p>}
    </div>
  </section>;
}
