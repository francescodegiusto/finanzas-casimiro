# Finanzas Casimiro

Página para llevar las finanzas de Casimiro y las personales de Franche y Patri. Se carga dictando o escribiendo, y muestra el resultado de cada mes. Solo pueden entrar las dos personas habilitadas, con su mail y su contraseña.

## Cómo está armada

| Parte | Qué hace | Dónde vive | Costo |
|---|---|---|---|
| La página (esta carpeta) | Lo que ven en el celular y la compu | GitHub Pages | Gratis |
| La base de datos | Guarda los movimientos y controla quién entra | Supabase | Gratis |
| La función `interpretar` | Convierte lo que dictan en movimientos | Supabase (Edge Functions) | Gratis |
| Claude | Entiende el texto dictado | API de Anthropic | Unos centavos de dólar por mes |

La clave de Claude queda guardada en Supabase, nunca en la página. Aunque alguien encuentre el link, sin usuario y contraseña habilitados no ve ni un número.

## Antes de empezar

- Una cuenta de **GitHub** (github.com).
- Una cuenta de **Supabase** (supabase.com). Se puede entrar con la de GitHub.
- Una cuenta en la **consola de Anthropic** (console.anthropic.com) con una tarjeta para cargar crédito.
- El archivo **`datos_iniciales.sql`**, que va aparte (tiene los datos de julio a noviembre y **no se sube a GitHub**).
- Unos 40 minutos.

---

## Paso 1. Crear la base de datos (Supabase)

1. En supabase.com tocá **New project**. Nombre: `casimiro`. Inventá una contraseña para la base y guardala. Región: **South America (São Paulo)**. Tocá **Create new project** y esperá un par de minutos.
2. En Supabase, menú izquierdo: **SQL Editor** → **New query**. Pegá todo el contenido de `supabase/schema.sql`.
3. Ahí mismo, en las últimas líneas, cambiá `MAIL-DE-FRANCHE@gmail.com` y `MAIL-DE-PATRI@gmail.com` por los mails reales de cada una. Tocá **Run**. Tiene que decir *Success*. (El archivo de GitHub queda con los mails de ejemplo, así no se publican los reales).
4. Otra vez **New query**: pegá todo `datos_iniciales.sql` y tocá **Run**. Esto carga julio a noviembre (596 movimientos). Si lo corrés dos veces no se duplica nada.
5. **Crear los dos usuarios.** Menú **Authentication** → **Users** → **Add user** → **Create new user**. Poné el mail y una contraseña, y tildá **Auto Confirm User**. Repetilo para tu mamá. Los mails tienen que ser los mismos que pusiste en el punto 3.
6. **Cerrar la puerta a desconocidos.** En **Authentication** → **Sign In / Providers** (en algunas versiones está en **Settings**), desactivá **Allow new users to sign up** y guardá. Así nadie más puede crearse una cuenta.

## Paso 2. Conectar Claude (para entender los audios)

1. En console.anthropic.com, entrá a **Billing** y cargá crédito (con USD 5 debería alcanzar para meses de uso normal). En **Limits** podés poner un tope de gasto mensual.
2. En **API Keys** → **Create Key**. Copiá la clave (empieza con `sk-ant-`). Se muestra una sola vez.
3. En Supabase: **Edge Functions** → **Secrets** → agregá uno nuevo con nombre `ANTHROPIC_API_KEY` y como valor la clave que copiaste. Guardá.
4. En **Edge Functions** → **Deploy a new function** → **Via Editor**. Nombre: `interpretar` (exacto, en minúsculas). Borrá el código de ejemplo, pegá todo el contenido de `supabase/functions/interpretar/index.ts` y tocá **Deploy**. Después, en la pestaña **Details** de la función, apagá **Verify JWT with legacy secret** y tocá **Save changes**: la función ya revisa por su cuenta que quien la usa sea Franche o Patri.

> Si en algún momento querés usar otro modelo de Claude, agregá otro secreto llamado `MODELO` con el nombre del modelo. Si no está, usa `claude-haiku-5-5`, que es rápido y barato.

## Paso 3. Conectar la página con la base

1. En Supabase: **Project Settings** → **API** (o **API Keys** / **Data API**). Copiá:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - la clave **pública**: se llama `anon` o `publishable`.
2. Abrí `config.js` y reemplazá `https://TU-PROYECTO.supabase.co` y `TU-CLAVE-PUBLICA` por esos dos valores. Guardá.

> No pongas nunca en `config.js` la clave `service_role` / `secret` de Supabase ni la clave de Claude. La clave pública sí puede estar a la vista: la base solo responde a los mails habilitados.

## Paso 4. Publicar desde GitHub

1. En github.com → **New repository**. Nombre: `finanzas-casimiro`. Elegí **Public** (GitHub Pages es gratis solo con repositorios públicos; el código no tiene datos ni claves secretas). Tocá **Create repository**.
2. En la página del repositorio nuevo, tocá **uploading an existing file**. Arrastrá **todo el contenido** de esta carpeta: `index.html`, `app.js`, `config.js` (ya completado), `manifest.webmanifest`, `LEEME.md` y las carpetas `icons` y `supabase`. **No subas `datos_iniciales.sql`.** Tocá **Commit changes**.
3. En el repositorio: **Settings** → **Pages**. En *Source* elegí **Deploy from a branch**, branch **main**, carpeta **/ (root)**, y **Save**.
4. En uno o dos minutos aparece el link arriba de esa misma pantalla: `https://TU-USUARIO.github.io/finanzas-casimiro/`. Esa es la página.

> ¿Preferís que el repositorio sea privado? GitHub Pages con repositorio privado es pago. La alternativa gratis es Netlify: en app.netlify.com → **Add new site** → **Import an existing project** → GitHub → elegí el repositorio → dejá vacío el *Build command*, poné `.` en *Publish directory* → **Deploy**.

## Paso 5. Probar

1. Abrí el link y entrá con tu mail y contraseña.
2. En **Noviembre 2026** tiene que decir: entró **$ 7.712.410**, salió **$ 5.027.108**, quedó **$ 2.685.302**.
3. Tocá el micrófono, decí *"pagué 1000 pesos de prueba en efectivo"*, revisá la fila y tocá **Guardar**. Después borrala desde **Movimientos**.

## En el celular y la computadora

- **iPhone:** abrí el link en **Safari**, entrá, y tocá **Compartir** → **Agregar a inicio**. Queda como una app con el ícono de Casimiro. La primera vez hay que volver a entrar con mail y contraseña.
- **Micrófono en iPhone:** la primera vez Safari pide permiso. Si el botón no anda, revisá **Ajustes → General → Teclado → Activar Dictado** y **Ajustes → Safari → Micrófono**. Siempre podés tocar el micrófono del teclado dentro del cuadro de texto y después **Anotar**. Esto último anda siempre, también desde el ícono de inicio.
- **Computadora:** el micrófono funciona en Chrome, Edge y Safari. En Firefox, escribí.
- Lo que carga una aparece solo en el celular de la otra.

## Todos los meses

- **Ventas:** en **Herramientas**, subí el Excel del sistema de stock. Toma la fecha, el total y la forma de pago de cada venta y no repite las que ya estaban.
- **Cheques:** cargá cada cheque cuando lo emiten, con su fecha de cobro. Se pueden dictar juntos: *"seis cheques de 500 mil a Idrogeno, el primero el 15 de diciembre"*.
- **Copia de seguridad:** en **Herramientas** → **Descargar CSV**. Guardalo en Drive. El plan gratis de Supabase no hace copias automáticas.

## Quién puede entrar

Tienen que cumplirse las dos cosas: tener usuario en **Authentication → Users** y estar en la tabla **miembros** (Supabase → **Table Editor** → `miembros`). La base rechaza a cualquier otra persona aunque tenga el link.

- **Sumar a alguien:** crealo en Users y agregá una fila en `miembros` (columna `libro`: `f` o `p`, según en qué libreta carga lo personal).
- **Sacar a alguien:** borrá su fila de `miembros` y su usuario.
- **Contraseña olvidada:** en **Authentication → Users**, borrá ese usuario y crealo de nuevo con otra contraseña. Los movimientos no se pierden.

## Si algo no anda

| Mensaje o problema | Qué hacer |
|---|---|
| "Falta configurar la conexión" | Completá `config.js` (paso 3) y subilo de nuevo a GitHub. |
| "El mail o la contraseña no coinciden" | Revisá el usuario en Authentication → Users. |
| "Tu usuario existe pero no está habilitado" | El mail no está en la tabla `miembros`, o está escrito distinto. |
| "Falta publicar la función interpretar" | Hacé el paso 2.4. El nombre tiene que ser `interpretar`. |
| "Falta la clave de Claude en Supabase" | Revisá el secreto `ANTHROPIC_API_KEY` (paso 2.3) y que tenga crédito. |
| La página no carga datos después de unos días sin usarla | En el plan gratis, Supabase pausa el proyecto tras 7 días sin uso. Entrá a supabase.com y tocá **Restore project**. |
| Cambié algo en GitHub y no se ve | Esperá dos minutos y recargá la página. |
