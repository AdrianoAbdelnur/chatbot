"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { MonitoringCatalog, type CatalogCompany, type CatalogVehicle } from "./components/MonitoringCatalog.tsx";
import { ManualCheckSelection } from "./components/ManualCheckSelection.tsx";
import { CheckFeedback } from "./components/CheckFeedback.tsx";
import { IncidentTable } from "./components/IncidentTable.tsx";
import { clearManualSelection, createManualSelectionState, toggleManualCompany, toggleManualVehicle, type ManualSelectionState } from "../../lib/offline-monitoring/manual-selection-state.ts";

type OperationalStatus =
  | "workshop"
  | "technical_review"
  | "consulted_pending_answer"
  | "reporting_again"
  | "customer_debt";

type WhatsappQueryState =
  | "not_authorized"
  | "authorized_not_sent"
  | "dispatching"
  | "sent"
  | "failed";

type OperatorActor = {
  id: string;
  name: string;
};

type BoardRow = {
  id: string;
  system: string;
  companyName: string;
  plate: string;
  lastReportedAt: string;
  offlineHours: number;
  operationalStatus: OperationalStatus | null;
  operatorComment: string | null;
  reviewedAt: string | null;
  reviewedBy: OperatorActor | null;
  authorizedAt: string | null;
  whatsappQueryState: WhatsappQueryState;
  whatsappFailureReason: string | null;
  whatsappCustomerReply: {
    text: string;
    receivedAt: string;
  } | null;
};

type MonitoringCompany = {
  companyKey: string;
  companyName: string;
  vehicleCount: number;
  hasContact: boolean;
};

type ScanResult = {
  companyName: string;
  vehicleCount: number;
  delayedCount: number;
  reportingCount: number;
  missingReportCount: number;
};

type DispatchSummary = {
  companyName: string;
  notificationCount: number;
  acceptedCount: number;
  failedCount: number;
  skippedDuplicateCount: number;
};

type Feedback = {
  type: "info" | "error";
  text: string;
};

type ReviewDraft = {
  operationalStatus: OperationalStatus | "";
  comment: string;
};

const OPERATOR_STORAGE_KEY = "offline-board-operator-id";
const MAX_COMMENT_LENGTH = 1000;

// Colour is presentation only. The semantic status name is what gets persisted,
// and these Tailwind classes are written as complete literal strings so the JIT
// scanner can see them.
const STATUS_PRESENTATION: Record<
  OperationalStatus,
  { label: string; className: string }
> = {
  workshop: {
    label: "Detenido / taller",
    className: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  },
  technical_review: {
    label: "Revisión técnica",
    className: "bg-sky-100 text-sky-900 ring-1 ring-sky-300",
  },
  consulted_pending_answer: {
    label: "Consultado, espera respuesta",
    className: "bg-violet-100 text-violet-900 ring-1 ring-violet-300",
  },
  reporting_again: {
    label: "Reportando de nuevo",
    className: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
  },
  customer_debt: {
    label: "Excepción: deuda del cliente",
    className: "bg-rose-100 text-rose-900 ring-1 ring-rose-300",
  },
};

const QUERY_STATE_PRESENTATION: Record<
  WhatsappQueryState,
  { label: string; className: string }
> = {
  not_authorized: {
    label: "Sin autorizar",
    className: "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-300",
  },
  authorized_not_sent: {
    label: "Autorizado, sin enviar",
    className: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  },
  dispatching: {
    label: "Enviando",
    className: "bg-sky-100 text-sky-900 ring-1 ring-sky-300",
  },
  sent: {
    label: "Enviado",
    className: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
  },
  failed: {
    label: "Con error",
    className: "bg-rose-100 text-rose-900 ring-1 ring-rose-300",
  },
};

// The API keeps its rejection reasons as stable English codes. Translating them
// for display belongs here, not in the route contract.
const REJECTION_MESSAGES: Record<string, string> = {
  unknown_operator: "Operador desconocido.",
  unknown_incident: "El incidente ya no está activo.",
  unknown_company: "La empresa no existe en la plataforma.",
  invalid_status: "El estado operativo no es válido.",
  comment_too_long: "El comentario supera los 1000 caracteres.",
  no_incidents: "No se seleccionó ningún vehículo.",
};

function translateError(error: string | undefined, fallback: string) {
  if (!error) {
    return fallback;
  }

  return REJECTION_MESSAGES[error] ?? fallback;
}

const OPERATIONAL_STATUS_OPTIONS = Object.keys(
  STATUS_PRESENTATION,
) as OperationalStatus[];

// The selected operator lives in localStorage rather than component state so
// that it survives a reload. Reading it through an external store keeps the
// server render deterministic and avoids a setState during hydration.
const operatorListeners = new Set<() => void>();

function subscribeToStoredOperator(onStoreChange: () => void) {
  operatorListeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    operatorListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getStoredOperatorId() {
  return window.localStorage.getItem(OPERATOR_STORAGE_KEY) ?? "";
}

function getServerOperatorId() {
  return "";
}

function storeOperatorId(operatorId: string) {
  window.localStorage.setItem(OPERATOR_STORAGE_KEY, operatorId);

  for (const listener of operatorListeners) {
    listener();
  }
}

function formatAge(offlineHours: number) {
  const totalHours = Math.floor(offlineHours);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

async function fetchBoardData() {
  const [incidentsResponse, operatorsResponse] = await Promise.all([
    fetch("/api/offline-board/incidents", { cache: "no-store" }),
    fetch("/api/offline-board/operators", { cache: "no-store" }),
  ]);

  if (!incidentsResponse.ok || !operatorsResponse.ok) {
    throw new Error("The board could not be loaded.");
  }

  const incidentsData = (await incidentsResponse.json()) as {
    rows?: BoardRow[];
  };
  const operatorsData = (await operatorsResponse.json()) as {
    operators?: OperatorActor[];
  };

  return {
    rows: Array.isArray(incidentsData.rows) ? incidentsData.rows : [],
    operators: Array.isArray(operatorsData.operators)
      ? operatorsData.operators
      : [],
  };
}

async function fetchMonitoringCatalog() {
  const response = await fetch("/api/offline-board/catalog", { cache: "no-store" });
  if (!response.ok) throw new Error("The monitoring catalog could not be loaded.");
  const data = (await response.json()) as { companies?: CatalogCompany[] };
  return Array.isArray(data.companies) ? data.companies : [];
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OperatorBoard() {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [operators, setOperators] = useState<OperatorActor[]>([]);
  const operatorId = useSyncExternalStore(
    subscribeToStoredOperator,
    getStoredOperatorId,
    getServerOperatorId,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [dispatches, setDispatches] = useState<DispatchSummary[]>([]);
  const [companies, setCompanies] = useState<MonitoringCompany[]>([]);
  const [companyKey, setCompanyKey] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [catalogCompanies, setCatalogCompanies] = useState<CatalogCompany[]>([]);
  const [catalogCompanyKey, setCatalogCompanyKey] = useState("");
  const [manualSelection, setManualSelection] = useState<ManualSelectionState>(createManualSelectionState);

  useEffect(() => {
    let isActive = true;

    async function loadInitialBoard() {
      try {
        const data = await fetchBoardData();

        if (isActive) {
          setRows(data.rows);
          setOperators(data.operators);
          try { setCatalogCompanies(await fetchMonitoringCatalog()); } catch { setFeedback({ type: "error", text: "No se pudo cargar el catálogo de monitoreo." }); }
        }
      } catch {
        if (isActive) {
          setFeedback({
            type: "error",
            text: "No se pudo cargar la planilla.",
          });
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialBoard();

    return () => {
      isActive = false;
    };
  }, []);

  async function refreshBoard() {
    try {
      const data = await fetchBoardData();

      setRows(data.rows);
      setOperators(data.operators);
      setCatalogCompanies(await fetchMonitoringCatalog());
    } catch {
      setFeedback({
        type: "error",
        text: "No se pudo actualizar la planilla.",
      });
    }
  }

  async function updateMembership(vehicle: CatalogVehicle, enabled: boolean) {
    setBusyAction(`membership:${vehicle.vehicleId}`);
    try {
      const response = await fetch("/api/offline-board/membership", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId: vehicle.vehicleId, enabled }) });
      if (!response.ok) throw new Error();
      setCatalogCompanies((companies) => companies.map((company) => ({ ...company, vehicles: company.vehicles.map((item) => item.vehicleId === vehicle.vehicleId ? { ...item, enabled } : item) })));
    } catch { setFeedback({ type: "error", text: "No se pudo actualizar la membresía automática." }); }
    finally { setBusyAction(null); }
  }

  async function runManualCatalogCheck() {
    if (!operatorId) { setFeedback({ type: "error", text: "Seleccione un operador antes del chequeo manual." }); return; }
    setBusyAction("manual-check");
    try {
      const vehicles = catalogCompanies.flatMap((company) => company.vehicles.filter((vehicle) => manualSelection.selectedVehicleIds.includes(vehicle.vehicleId)).map((vehicle) => ({ vehicleId: vehicle.vehicleId, companyKey: vehicle.companyKey })));
      const response = await fetch("/api/offline-board/checks", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ operatorId, companyKeys: manualSelection.selectedCompanyKeys, vehicles }) });
      if (!response.ok) throw new Error();
      setManualSelection(clearManualSelection(manualSelection));
      setFeedback({ type: "info", text: "Chequeo manual ejecutado. WhatsApp no se envía automáticamente." });
      await refreshBoard();
    } catch { setFeedback({ type: "error", text: "No se pudo ejecutar el chequeo manual." }); }
    finally { setBusyAction(null); }
  }

  function getDraft(row: BoardRow): ReviewDraft {
    return (
      drafts[row.id] ?? {
        operationalStatus: row.operationalStatus ?? "",
        comment: row.operatorComment ?? row.whatsappCustomerReply?.text ?? "",
      }
    );
  }

  function updateDraft(rowId: string, patch: Partial<ReviewDraft>) {
    setDrafts((currentDrafts) => {
      const row = rows.find((boardRow) => boardRow.id === rowId);
      const current = currentDrafts[rowId] ?? {
        operationalStatus: row?.operationalStatus ?? "",
        comment: row?.operatorComment ?? row?.whatsappCustomerReply?.text ?? "",
      };

      return { ...currentDrafts, [rowId]: { ...current, ...patch } };
    });
  }

  function requireOperator() {
    if (!operatorId) {
      setFeedback({
        type: "error",
        text: "Seleccione su nombre antes de operar sobre una fila.",
      });
      return false;
    }

    return true;
  }

  async function handleReview(row: BoardRow) {
    if (!requireOperator()) {
      return;
    }

    const draft = getDraft(row);

    if (!draft.operationalStatus) {
      setFeedback({ type: "error", text: "Seleccione un estado operativo." });
      return;
    }

    setBusyAction(`review:${row.id}`);
    setFeedback(null);

    try {
      const response = await fetch("/api/offline-board/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId,
          incidentId: row.id,
          operationalStatus: draft.operationalStatus,
          comment: draft.comment,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setFeedback({
          type: "error",
          text: translateError(
            data.error,
            "No se pudo guardar la revisión.",
          ),
        });
        return;
      }

      setDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[row.id];

        return nextDrafts;
      });
      setFeedback({
        type: "info",
        text: `Revisión guardada para ${row.plate}.`,
      });
      await refreshBoard();
    } catch {
      setFeedback({ type: "error", text: "No se pudo contactar al servidor." });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRecheck(row: BoardRow) {
    if (!requireOperator()) {
      return;
    }

    setBusyAction(`recheck:${row.id}`);
    setFeedback(null);

    try {
      const response = await fetch("/api/offline-board/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId, incidentId: row.id }),
      });
      const data = (await response.json()) as {
        error?: string;
        outcome?: string;
      };

      if (!response.ok) {
        setFeedback({
          type: "error",
          text: translateError(data.error, "Falló el rechequeo."),
        });
        return;
      }

      setFeedback({
        type: "info",
        text:
          data.outcome === "no_change"
            ? `${row.plate}: sin reporte nuevo utilizable.`
            : `${row.plate} rechequeado.`,
      });
      await refreshBoard();
    } catch {
      setFeedback({ type: "error", text: "No se pudo contactar al servidor." });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAuthorize() {
    if (!requireOperator()) {
      return;
    }

    if (selectedIds.length === 0) {
      setFeedback({ type: "error", text: "Seleccione al menos un vehículo." });
      return;
    }

    setBusyAction("authorize");
    setFeedback(null);
    setDispatches([]);

    try {
      const response = await fetch("/api/offline-board/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId, incidentIds: selectedIds }),
      });
      const data = (await response.json()) as {
        error?: string;
        dispatches?: DispatchSummary[];
      };

      if (!response.ok) {
        setFeedback({
          type: "error",
          text: translateError(data.error, "Falló la autorización."),
        });
        return;
      }

      setDispatches(Array.isArray(data.dispatches) ? data.dispatches : []);
      setSelectedIds([]);
      setFeedback({
        type: "info",
        text: `Se autorizaron ${selectedIds.length} vehículo(s).`,
      });
      await refreshBoard();
    } catch {
      setFeedback({ type: "error", text: "No se pudo contactar al servidor." });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLoadCompanies() {
    setBusyAction("companies");
    setFeedback(null);

    try {
      const response = await fetch("/api/offline-board/companies", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        error?: string;
        companies?: MonitoringCompany[];
      };

      if (!response.ok) {
        setFeedback({
          type: "error",
          text: translateError(
            data.error,
            "No se pudo leer la lista de empresas.",
          ),
        });
        return;
      }

      setCompanies(Array.isArray(data.companies) ? data.companies : []);
      setFeedback({
        type: "info",
        text: `${data.companies?.length ?? 0} empresa(s) encontradas en la plataforma.`,
      });
    } catch {
      setFeedback({ type: "error", text: "No se pudo contactar al servidor." });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleScanCompany() {
    if (!requireOperator()) {
      return;
    }

    if (!companyKey) {
      setFeedback({ type: "error", text: "Seleccione una empresa." });
      return;
    }

    setBusyAction("scan");
    setFeedback(null);
    setScanResult(null);

    try {
      const response = await fetch("/api/offline-board/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId, companyKey }),
      });
      const data = (await response.json()) as {
        error?: string;
        result?: ScanResult;
      };

      if (!response.ok) {
        setFeedback({
          type: "error",
          text: translateError(data.error, "Falló el escaneo de la empresa."),
        });
        return;
      }

      setScanResult(data.result ?? null);
      setFeedback({ type: "info", text: "Escaneo completado." });
      await refreshBoard();
    } catch {
      setFeedback({ type: "error", text: "No se pudo contactar al servidor." });
    } finally {
      setBusyAction(null);
    }
  }

  function toggleSelected(rowId: string) {
    setSelectedIds((currentIds) =>
      currentIds.includes(rowId)
        ? currentIds.filter((id) => id !== rowId)
        : [...currentIds, rowId],
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <MonitoringCatalog companies={catalogCompanies} selectedCompanyKey={catalogCompanyKey} onCompanyChange={setCatalogCompanyKey} onMembershipChange={updateMembership} />
      <ManualCheckSelection companies={catalogCompanies} selectedCompanyKeys={manualSelection.selectedCompanyKeys} selectedVehicleIds={manualSelection.selectedVehicleIds} onCompanyToggle={(key) => setManualSelection((state) => toggleManualCompany(state, key))} onVehicleToggle={(id) => setManualSelection((state) => toggleManualVehicle(state, id))} onSubmit={runManualCatalogCheck} disabled={busyAction !== null} />
      <CheckFeedback error={feedback?.type === "error" ? feedback.text : undefined} message={feedback?.type === "info" ? feedback.text : undefined} />
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-800">Operador</span>
          <select
            value={operatorId}
            onChange={(event) => storeOperatorId(event.target.value)}
            className="min-w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Seleccione su nombre…</option>
            {operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-neutral-500">
            Solo se usa para atribuir acciones. No es un inicio de sesión.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-600">
            {selectedIds.length} seleccionado(s)
          </span>
          <button
            type="button"
            onClick={handleAuthorize}
            disabled={busyAction !== null || selectedIds.length === 0}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {busyAction === "authorize"
              ? "Autorizando…"
              : "Autorizar y notificar"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-800">
            Escaneo a demanda por empresa
          </span>
          <select
            value={companyKey}
            onChange={(event) => setCompanyKey(event.target.value)}
            disabled={companies.length === 0 || busyAction !== null}
            className="min-w-80 rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100"
          >
            <option value="">
              {companies.length === 0
                ? "Primero traiga las empresas…"
                : "Seleccione una empresa…"}
            </option>
            {companies.map((company) => (
              <option key={company.companyKey} value={company.companyKey}>
                {company.companyName} — {company.vehicleCount} vehículo(s)
                {company.hasContact ? "" : " · sin contacto"}
              </option>
            ))}
          </select>
          <span className="text-xs text-neutral-500">
            Se escanea una empresa por vez. No hay escaneo de toda la
            plataforma.
          </span>
        </label>

        <button
          type="button"
          onClick={handleLoadCompanies}
          disabled={busyAction !== null}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-400"
        >
          {busyAction === "companies" ? "Trayendo…" : "Traer empresas"}
        </button>

        <button
          type="button"
          onClick={handleScanCompany}
          disabled={busyAction !== null || !companyKey}
          className="rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {busyAction === "scan" ? "Escaneando…" : "Escanear esta empresa"}
        </button>
      </div>

      {scanResult && (
        <p className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
          <strong className="text-neutral-900">{scanResult.companyName}</strong>
          : {scanResult.vehicleCount} vehículo(s) revisados,{" "}
          {scanResult.delayedCount} retrasado(s), {scanResult.reportingCount}{" "}
          reportando, {scanResult.missingReportCount} sin reporte utilizable.
        </p>
      )}

      {feedback && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={
            feedback.type === "error"
              ? "rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-800 ring-1 ring-rose-200"
              : "rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200"
          }
        >
          {feedback.text}
        </p>
      )}

      {dispatches.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          {dispatches.map((dispatch) => (
            <li key={dispatch.companyName} className="text-neutral-700">
              <strong className="text-neutral-900">
                {dispatch.companyName}
              </strong>
              : {dispatch.notificationCount} mensaje(s),{" "}
              {dispatch.acceptedCount} aceptado(s) por Meta,{" "}
              {dispatch.failedCount} con error,{" "}
              {dispatch.skippedDuplicateCount} omitido(s) por duplicado.
            </li>
          ))}
        </ul>
      )}

      <IncidentTable><div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-280 border-collapse text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
            <tr>
              <th className="w-10 px-3 py-3" />
              <th className="px-3 py-3">Empresa</th>
              <th className="px-3 py-3">Patente</th>
              <th className="px-3 py-3">Último reporte</th>
              <th className="px-3 py-3">Antigüedad</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">?Qu? inform? el cliente?</th>
              <th className="px-3 py-3">Revisado</th>
              <th className="px-3 py-3">WhatsApp</th>
              <th className="px-3 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-neutral-500">
                  Cargando la planilla…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-neutral-500">
                  No hay vehículos retrasados en este momento.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const draft = getDraft(row);
                const queryState = QUERY_STATE_PRESENTATION[
                  row.whatsappQueryState
                ] ?? {
                  label: row.whatsappQueryState,
                  className: "bg-neutral-100 text-neutral-700",
                };

                return (
                  <tr
                    key={row.id}
                    className="border-t border-neutral-200 align-top"
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        aria-label={`Seleccionar ${row.plate}`}
                      />
                    </td>
                    <td className="px-3 py-3 text-neutral-800">
                      {row.companyName}
                    </td>
                    <td className="px-3 py-3 font-mono font-medium text-neutral-900">
                      {row.plate}
                    </td>
                    <td className="px-3 py-3 text-neutral-600">
                      {formatTimestamp(row.lastReportedAt)}
                    </td>
                    <td className="px-3 py-3 font-medium text-neutral-900">
                      {formatAge(row.offlineHours)}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={draft.operationalStatus}
                        onChange={(event) =>
                          updateDraft(row.id, {
                            operationalStatus: event.target
                              .value as OperationalStatus,
                          })
                        }
                        className="w-full min-w-44 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      >
                        <option value="">—</option>
                        {OPERATIONAL_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_PRESENTATION[status].label}
                          </option>
                        ))}
                      </select>
                      {row.operationalStatus && (
                        <span
                          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_PRESENTATION[row.operationalStatus].className}`}
                        >
                          {STATUS_PRESENTATION[row.operationalStatus].label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <textarea
                        rows={2}
                        maxLength={MAX_COMMENT_LENGTH}
                        value={draft.comment || row.whatsappCustomerReply?.text || ""}
                        onChange={(event) =>
                          updateDraft(row.id, { comment: event.target.value })
                        }
                        placeholder="¿Qué informó el cliente?"
                        className="w-full min-w-56 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-3 text-xs text-neutral-600">
                      <div>{formatTimestamp(row.reviewedAt)}</div>
                      <div className="text-neutral-500">
                        {row.reviewedBy?.name ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs ${queryState.className}`}
                      >
                        {queryState.label}
                      </span>
                      {row.whatsappFailureReason && (
                        <p className="mt-1 max-w-56 text-xs text-rose-700">
                          {row.whatsappFailureReason}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleReview(row)}
                          disabled={busyAction !== null}
                          className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-400"
                        >
                          {busyAction === `review:${row.id}`
                            ? "Guardando…"
                            : "Guardar revisión"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRecheck(row)}
                          disabled={busyAction !== null}
                          className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-400"
                        >
                          {busyAction === `recheck:${row.id}`
                            ? "Chequeando…"
                            : "Rechequear"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div></IncidentTable>
    </section>
  );
}
