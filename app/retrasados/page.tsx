import { OperatorBoard } from "./operator-board.tsx";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Planilla de retrasados",
  description:
    "Revisión de vehículos retrasados y autorización de avisos por WhatsApp a las empresas clientes.",
};

export default function RetrasadosPage() {
  return (
    <main
      lang="es"
      className="mx-auto flex w-full max-w-440 flex-col gap-6 p-6"
    >
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Monitoreo de vehículos
        </p>
        <h1 className="text-2xl font-semibold text-neutral-900">
          Planilla de retrasados
        </h1>
        <p className="text-sm text-neutral-600">
          Ningún aviso de WhatsApp sale de este sistema hasta que un operador lo
          autorice acá.
        </p>
      </header>

      <OperatorBoard />
    </main>
  );
}
