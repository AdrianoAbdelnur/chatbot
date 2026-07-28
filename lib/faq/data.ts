export type FaqSourceEntry = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

export const FAQ_SOURCE_ENTRIES: FaqSourceEntry[] = [
  {
    id: "coordinate-gps-installation",
    category: "installation",
    question: "¿Cómo coordino una instalación de GPS?",
    answer:
      "Para coordinar una instalación, necesitamos que nos indiques la empresa, cantidad de vehículos, ubicación donde estarán disponibles, datos de contacto del responsable y horarios posibles. Con esa información coordinamos un turno con el área técnica.",
  },
  {
    id: "gps-installation-required-data",
    category: "installation",
    question: "¿Qué datos necesito enviar para instalar un equipo?",
    answer:
      "Necesitamos patente o identificación del vehículo, tipo de unidad, ubicación de instalación, nombre y teléfono del responsable en el lugar, y disponibilidad horaria. También es útil saber si el vehículo ya tuvo otro equipo instalado anteriormente.",
  },
  {
    id: "gps-installation-duration",
    category: "installation",
    question: "¿Cuánto demora una instalación?",
    answer:
      "El tiempo depende del tipo de vehículo y del equipo a instalar. En general, una instalación GPS simple puede demorar entre 45 minutos y 2 horas. Si incluye accesorios, cámaras, sensores o pruebas especiales, puede llevar más tiempo.",
  },
  {
    id: "multiple-installations-same-day",
    category: "installation",
    question: "¿Puedo instalar varios vehículos el mismo día?",
    answer:
      "Sí, se puede coordinar la instalación de varias unidades el mismo día. Para eso necesitamos saber cuántos vehículos estarán disponibles, en qué lugar y durante qué franja horaria. El equipo técnico confirmará la planificación.",
  },
  {
    id: "gps-installation-location",
    category: "installation",
    question: "¿La instalación se hace en nuestras oficinas o en otro lugar?",
    answer:
      "Depende de la disponibilidad técnica y de la zona. En muchos casos podemos coordinar la instalación en la base del cliente, taller, playa de estacionamiento o punto operativo. El área técnica debe confirmar la cobertura y disponibilidad.",
  },
  {
    id: "vehicle-unavailable-for-installation",
    category: "installation",
    question: "¿Qué pasa si el vehículo no está disponible el día del turno?",
    answer:
      "Si la unidad no está disponible, se debe reprogramar la instalación. Recomendamos avisar con la mayor anticipación posible para evitar demoras y poder reasignar el turno.",
  },
  {
    id: "request-gps-maintenance",
    category: "support",
    question: "¿Cómo solicito mantenimiento de un equipo GPS?",
    answer:
      "Para solicitar mantenimiento, indicá la patente o identificación del vehículo, el problema observado, desde cuándo ocurre y un contacto responsable. Con esa información se genera la solicitud para revisión técnica.",
  },
  {
    id: "gps-problem-required-data",
    category: "support",
    question: "¿Qué datos debo mandar para revisar un problema de GPS?",
    answer:
      "Necesitamos patente o nombre del móvil, descripción del problema, fecha y hora aproximada en que se detectó, y si el vehículo estuvo en uso o detenido. También sirve informar si hubo trabajos eléctricos, cambio de batería o reparación reciente.",
  },
  {
    id: "vehicle-not-updating-position",
    category: "support",
    question: "Mi vehículo no actualiza posición, ¿qué puede ser?",
    answer:
      "Puede deberse a falta de señal GPS, falta de señal celular, equipo apagado, corte de alimentación, batería baja, zona sin cobertura o una falla técnica. El área de soporte puede revisar la última comunicación y orientar el siguiente paso.",
  },
  {
    id: "vehicle-shows-old-location",
    category: "support",
    question: "El vehículo aparece en una ubicación vieja, ¿qué hago?",
    answer:
      "Primero verificá si la fecha y hora de la última posición son recientes. Si la última posición es antigua, puede que el equipo no esté transmitiendo. En ese caso se debe solicitar revisión con la patente o identificación del móvil.",
  },
  {
    id: "moving-vehicle-shows-stopped",
    category: "support",
    question: "¿Por qué un vehículo aparece detenido si está circulando?",
    answer:
      "Puede haber demora en la actualización, pérdida temporal de señal, mala cobertura celular, problema de GPS o una configuración incorrecta. Soporte puede verificar los últimos datos recibidos y confirmar si el equipo está reportando correctamente.",
  },
  {
    id: "gps-speed-differs-from-speedometer",
    category: "support",
    question:
      "¿Por qué la velocidad que muestra el sistema no coincide exactamente con el velocímetro?",
    answer:
      "La velocidad GPS puede tener pequeñas diferencias respecto al velocímetro del vehículo. El sistema calcula velocidad a partir de posición satelital y transmisión de datos, mientras que el velocímetro usa sensores propios del vehículo.",
  },
  {
    id: "add-new-vehicle",
    category: "vehicle-management",
    question: "¿Cómo pido el alta de un nuevo vehículo en la plataforma?",
    answer:
      "Para dar de alta un vehículo, enviá los datos de la unidad, patente, empresa a la que pertenece, tipo de vehículo y datos del equipo si ya fue instalado. Si todavía no tiene equipo, primero se debe coordinar instalación.",
  },
  {
    id: "remove-vehicle",
    category: "vehicle-management",
    question: "¿Cómo solicito la baja de un vehículo?",
    answer:
      "Para solicitar una baja, indicá empresa, patente o identificación del vehículo y motivo de la baja. El equipo administrativo o técnico confirmará si corresponde retirar el dispositivo, desactivar el servicio o reasignarlo.",
  },
  {
    id: "move-gps-between-vehicles",
    category: "vehicle-management",
    question: "¿Se puede cambiar un GPS de un vehículo a otro?",
    answer:
      "Sí, se puede hacer una reinstalación o traslado de equipo. Debe coordinarse con soporte o técnica, indicando el vehículo origen, el vehículo destino y el lugar donde se realizará el trabajo.",
  },
  {
    id: "vehicle-battery-changed",
    category: "support",
    question: "¿Qué hago si cambiaron la batería del vehículo?",
    answer:
      "Si después de un cambio de batería el equipo dejó de transmitir, puede haberse desconectado la alimentación del GPS. Informá la patente y la fecha del cambio para que soporte revise el estado del equipo.",
  },
  {
    id: "vehicle-returned-from-workshop",
    category: "support",
    question: "¿Qué hago si el vehículo estuvo en taller?",
    answer:
      "Si el vehículo estuvo en taller y luego el GPS dejó de funcionar, es posible que se haya desconectado o manipulado el cableado. Indicá patente, fecha del trabajo y taller interviniente para solicitar revisión.",
  },
  {
    id: "request-platform-user",
    category: "access",
    question: "¿Cómo pido usuario para acceder a la plataforma?",
    answer:
      "Para crear un usuario, necesitamos nombre y apellido, email, empresa, perfil o permisos requeridos, y autorización de un responsable. No se crean usuarios sin validación de la empresa o cuenta correspondiente.",
  },
  {
    id: "recover-platform-password",
    category: "access",
    question: "¿Cómo recupero mi contraseña?",
    answer:
      "Si olvidaste tu contraseña, podés solicitar recuperación o blanqueo de clave. Por seguridad, soporte puede pedir validación de identidad o autorización de un responsable de la cuenta.",
  },
  {
    id: "limit-user-visible-vehicles",
    category: "access",
    question: "¿Puedo limitar qué vehículos ve cada usuario?",
    answer:
      "Sí, los usuarios pueden tener permisos según empresa, grupo, flota o vehículos asignados. Para modificar permisos se debe solicitar el cambio indicando usuario, empresa y unidades que debe visualizar.",
  },
  {
    id: "request-report",
    category: "reports",
    question: "¿Cómo solicito un reporte?",
    answer:
      "Indicá qué tipo de reporte necesitás, período de fechas, empresa o vehículo, y formato deseado si corresponde. Algunos reportes pueden generarse desde la plataforma y otros pueden requerir asistencia de soporte.",
  },
  {
    id: "available-reports",
    category: "reports",
    question: "¿Qué reportes se pueden obtener?",
    answer:
      "Según la configuración del sistema, se pueden obtener reportes de recorridos, paradas, velocidad, eventos, kilómetros, actividad, posiciones históricas, excesos de velocidad y otros indicadores operativos.",
  },
  {
    id: "view-historical-routes",
    category: "reports",
    question: "¿Puedo ver recorridos históricos?",
    answer:
      "Sí, la plataforma permite consultar recorridos históricos según disponibilidad de datos y permisos del usuario. Para solicitar ayuda, indicá patente, fecha y rango horario aproximado.",
  },
  {
    id: "historical-data-retention",
    category: "reports",
    question: "¿Por cuánto tiempo se guarda la información histórica?",
    answer:
      "El tiempo de conservación depende de la configuración del servicio, capacidad del servidor y política contratada. Para confirmar el período disponible, soporte debe verificar la configuración de la cuenta.",
  },
  {
    id: "incorrect-vehicle-data",
    category: "support",
    question: "¿Qué hago si veo datos incorrectos en un vehículo?",
    answer:
      "Reportá el caso indicando patente, fecha, hora y qué dato parece incorrecto. Puede tratarse de una configuración, error de carga, problema de comunicación o evento mal interpretado.",
  },
  {
    id: "configure-alerts",
    category: "alerts",
    question: "¿Se pueden configurar alertas?",
    answer:
      "Sí, se pueden configurar alertas según las funcionalidades disponibles: velocidad, ingreso o salida de zonas, desconexión, eventos, paradas, movimientos no autorizados u otros criterios. La disponibilidad depende del equipo y del servicio contratado.",
  },
  {
    id: "request-geofence",
    category: "alerts",
    question: "¿Cómo solicito una geocerca o zona?",
    answer:
      "Para crear una zona o geocerca, indicá nombre de la zona, dirección o coordenadas, radio aproximado o límites, empresa asociada y qué alerta o uso tendrá. Soporte o administración puede cargarla según corresponda.",
  },
  {
    id: "receive-alerts-by-whatsapp-or-email",
    category: "alerts",
    question: "¿Puedo recibir alertas por WhatsApp o email?",
    answer:
      "Depende de la configuración del sistema y del servicio contratado. Algunas alertas pueden enviarse por email, plataforma o integraciones externas. Para WhatsApp puede requerirse una integración adicional.",
  },
  {
    id: "suspected-gps-disconnection",
    category: "support",
    question: "¿Qué hago si sospecho que un equipo fue desconectado?",
    answer:
      "Informá la patente, fecha y hora aproximada del evento. Soporte puede revisar la última comunicación, eventos recibidos y estado del equipo para determinar si hubo desconexión, falta de alimentación o pérdida de señal.",
  },
  {
    id: "when-to-contact-human-support",
    category: "escalation",
    question: "¿Cuándo debo hablar con soporte humano?",
    answer:
      "Debés pedir soporte humano cuando el problema requiere coordinación de turno, revisión técnica, permisos de usuario, baja o alta de vehículos, cambios administrativos, reclamos, fallas persistentes o situaciones urgentes de seguridad.",
  },
];
