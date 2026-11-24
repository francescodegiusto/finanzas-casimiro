// Función "interpretar": recibe lo que dictaron o escribieron y devuelve los movimientos.
// Se publica en Supabase > Edge Functions con el nombre "interpretar".
// Necesita el secreto ANTHROPIC_API_KEY (Supabase > Edge Functions > Secrets).
// Opcional: el secreto MODELO para cambiar el modelo de Claude.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BOOK: Record<string, string> = { n: "Casimiro", f: "Franche", p: "Patri" };
const RUBROS = ["Comida", "Casa y servicios", "Tarjetas y créditos", "Salud", "Auto y transporte", "Ropa y cuidado",
  "Salidas y regalos", "Fiestas", "Cursos", "Suscripciones", "Inversiones", "Otros"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // 1. Solo las personas de la tabla "miembros": se le pregunta a la base con el token de quien llama
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  let miembro = false;
  try {
    const chk = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/es_miembro`, {
      method: "POST",
      headers: { apikey, Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
    });
    miembro = chk.ok && (await chk.json()) === true;
  } catch { miembro = false; }
  if (!miembro) return json({ error: "No autorizado" }, 403);

  // 2. Datos del pedido
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  const texto = String(body.texto ?? "").slice(0, 2000).trim();
  const libro = ["n", "f", "p"].includes(String(body.libro)) ? String(body.libro) : "n";
  const quien = ["f", "p"].includes(String(body.quien)) ? String(body.quien) : "f";
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(String(body.hoy)) ? String(body.hoy) : new Date().toISOString().slice(0, 10);
  const dia = String(body.dia ?? "").slice(0, 12);
  if (!texto) return json({ movimientos: [] });

  const prompt = `Cargás las finanzas de una familia. Casimiro es su local de ropa, que también alquila trajes. Lo manejan Franche y su mamá Patri, que además tienen sueldos y gastos personales.
Hoy es ${dia} ${hoy}. Está en la libreta: ${BOOK[libro]}. Habla: ${BOOK[libro === "n" ? quien : libro]}.
Convertí el texto en movimientos de plata. Respondé SOLO un array JSON, sin texto. Cada elemento:
{"fecha":"AAAA-MM-DD","donde":"código","detalle":"texto corto","monto":número,"pago":"Efectivo"|"Tarjeta"|"Transferencia"|"Otro"|"","rubro":"..."}
Códigos de "donde":
n|venta: venta de ropa del local. n|alquiler: cobro por alquiler de traje (seña o saldo).
n|fijo: gasto fijo del local (alquiler del local, sueldos o aguinaldo de empleadas, luz, agua, gas, teléfono, internet, monotributo, contador, asesoría, publicidad).
n|variable: otro gasto del local (mercadería pagada sin cheque, flete, correo, tintorería, costura, librería, limpieza, muebles, sorteos, varios).
n|cheque: cheque a un proveedor; la fecha es la de cobro. "6 cheques de 500 mil desde el 15/12" son 6 elementos, uno por mes, mismo día.
f|… es Franche y p|… es Patri: sueldo (sueldo o ingreso personal), gasto (gasto personal), ahorro (ahorro, dólares, inversión), puse (plata personal que puso en Casimiro), devolvio (Casimiro le devolvió plata).
${libro === "n" ? "Lo que no diga de quién es, es de Casimiro." : `Lo que no diga de quién es, es personal de ${BOOK[libro]}.`}
Si alguien pagó un gasto o cheque del local con su plata, devolvé DOS elementos: el gasto del local y el "puse" de esa persona.
"rubro" solo para gastos personales, uno de: ${RUBROS.join(", ")}. Para lo demás, "".
Montos: "mil" o "lucas" son miles, "palo" es millón, "medio palo" 500000. Solo el número.
Fechas: si no dicen, hoy. Resolvé "ayer", "el lunes" o "el 3" (de este mes). Pago: solo si lo dicen.
Ignorá lo que no sea un movimiento de plata. Sin movimientos: [].
Texto: """${texto}"""`;

  // 3. Pedido a Claude
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Falta configurar ANTHROPIC_API_KEY" }, 500);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("MODELO") || "claude-haiku-5-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) return json({ error: `Claude respondió ${r.status}`, detalle: (await r.text()).slice(0, 300) }, 502);
  const out = await r.json();
  const text = (out.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  let movimientos: unknown = [];
  try { movimientos = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : []; } catch { movimientos = []; }
  return json({ movimientos: Array.isArray(movimientos) ? movimientos.slice(0, 40) : [] });
});
