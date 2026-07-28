# WhatsApp Backend

## Qué es este proyecto

Aplicación Next.js con App Router que permite enviar y recibir mensajes mediante
WhatsApp Cloud API.

El navegador consume rutas locales. Solo el backend se comunica con Meta,
MongoDB y Gemini; las credenciales y secretos nunca deben exponerse al cliente.

Flujos principales:

- Envío de mensajes de texto mediante `POST /api/whatsapp/send`.
- Recepción y verificación de webhooks en `/api/whatsapp/webhook`.
- Persistencia de mensajes entrantes y salientes en MongoDB.
- Consulta de mensajes desde `GET /api/whatsapp/messages`.
- Respuesta automática experimental con Gemini para mensajes entrantes nuevos.

## Regla principal: entender y consensuar antes de implementar

**No empezar a modificar archivos apenas llega un pedido.**

Antes de implementar un cambio no trivial:

1. Leer este archivo y las instrucciones aplicables.
2. Inspeccionar el código, configuración, documentación y estado de Git
   relacionados con el pedido.
3. Explicar brevemente:
   - qué se entendió del problema;
   - qué existe actualmente;
   - qué se propone cambiar y qué quedará fuera;
   - qué riesgos, contratos o decisiones están involucrados;
   - cómo se verificará el resultado.
4. Señalar explícitamente cualquier supuesto.
5. Esperar la aprobación del usuario sobre el alcance y el enfoque.

Un pedido exploratorio, una idea o una descripción de un problema **no equivale
a autorización para implementar**. Una orden explícita como “implementá”,
“aplicá el cambio” o “hacelo” autoriza únicamente el alcance que esté claro y
acordado.

Si falta información que cambia materialmente la solución, hacer **una sola
pregunta concreta y detenerse**. No adivinar ni continuar mientras se espera la
respuesta.

Las lecturas, búsquedas y diagnósticos no destructivos necesarios para entender
el problema pueden realizarse antes de pedir aprobación.

## Durante la implementación

- Respetar exactamente el alcance aprobado.
- Si aparece un hallazgo que obliga a cambiar el plan, ampliar el alcance o
  tomar una nueva decisión, detenerse, explicarlo y volver a consensuar.
- No refactorizar ni “mejorar” código ajeno al pedido.
- No reemplazar decisiones existentes sin entender por qué fueron tomadas.
- No agregar dependencias, servicios, variables de entorno, colecciones o
  endpoints sin justificarlo y obtener aprobación explícita.
- Hacer cambios mínimos, coherentes y fáciles de revisar.
- No borrar, sobrescribir ni revertir cambios existentes del usuario.
- No ejecutar operaciones destructivas sobre archivos, Git, MongoDB o servicios
  externos sin autorización explícita.

## Cómo comunicar propuestas

- Recomendar una solución concreta y explicar brevemente por qué.
- Presentar alternativas solo cuando exista una bifurcación real, indicando sus
  tradeoffs.
- No afirmar que algo funciona, falla o está implementado sin verificarlo.
- Si el usuario parte de una premisa incorrecta, mostrar evidencia antes de
  corregirla.
- Diferenciar hechos verificados, inferencias y supuestos.
- Mantener las respuestas breves, salvo que la decisión requiera más contexto.

## Stack verificado

- Next.js 16 con App Router
- React 19
- TypeScript
- MongoDB mediante el driver oficial
- Tailwind CSS 4
- WhatsApp Cloud API
- Gemini para respuestas automáticas experimentales

## Invariantes de seguridad y comportamiento

- Nunca exponer al navegador tokens de WhatsApp, secretos de Meta, credenciales
  de MongoDB ni claves de Gemini.
- Mantener las variables sensibles exclusivamente del lado del servidor y fuera
  del repositorio.
- Validar la firma `X-Hub-Signature-256` de los webhooks con
  `META_APP_SECRET`.
- Conservar la deduplicación por ID de mensaje: una entrega repetida del webhook
  no debe generar respuestas automáticas duplicadas.
- No presentar un mensaje aceptado por Meta como entregado. La entrega se
  confirma mediante eventos de estado posteriores.
- No enviar a Gemini datos sensibles ni afirmar que el asistente accede a
  sistemas de clientes, vehículos o seguimiento en vivo.
- Mantener compatibles los contratos de las rutas existentes salvo que el
  cambio haya sido acordado explícitamente.

## Next.js 16: verificar antes de escribir

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Antes de modificar código de Next.js, leer la guía específica correspondiente
en `node_modules/next/dist/docs/`. No confiar únicamente en conocimiento previo.

## Verificación obligatoria

Antes de declarar terminado un cambio:

1. Revisar el diff completo y confirmar que coincide con el alcance aprobado.
2. Ejecutar las verificaciones relevantes.
3. Para cambios de código, ejecutar como mínimo:

   ```bash
   npm run lint
   npm run build
   ```

4. Informar qué se verificó, qué resultado tuvo y qué no pudo verificarse.

No ocultar errores ni declarar éxito si alguna comprobación relevante falla.

## Git

- Revisar `git status` antes de editar.
- Asumir que los cambios preexistentes pertenecen al usuario.
- No cambiar de branch, hacer stage, commit, push, reset, restore, rebase ni
  modificar el historial salvo pedido explícito.
- Si se solicita un commit, usar Conventional Commits.
- Nunca agregar atribución de IA ni `Co-Authored-By`.

## Variables de entorno

Las variables esperadas están documentadas en `.env.example`:

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
MONGODB_URI=
MONGODB_DATABASE=
GEMINI_API_KEY=
GEMINI_MODEL=
```

Nunca leer ni mostrar valores de `.env.local` en respuestas, logs o commits.

## Referencias

Cargar solo cuando sean relevantes:

- Funcionamiento, configuración y contratos actuales: `README.md`
- Scripts y versiones instaladas: `package.json`
- Variables requeridas sin secretos: `.env.example`
- Documentación vigente de Next.js: `node_modules/next/dist/docs/`
