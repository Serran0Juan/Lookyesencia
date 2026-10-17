/* Código compartido entre el panel de gestión (index.html) y el catálogo (catalogo.html):
   conexión con la planilla, clave de acceso, formatos, catálogo de fotos y cálculo de stock. */
(function () {
"use strict";

// URL de la aplicación web del Apps Script de la planilla (termina en /exec)
const API_URL = "https://script.google.com/macros/s/AKfycbyPcFlB3GswAnQlqwxtj4I49mWnpXxoWYw1hejuSS0Q0E04PkvuYLq8tT9xjwVdK74/exec";

const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
const remember = (k, v) => { try { store && store.setItem("lye:" + k, v); } catch (e) {} };
const recall = (k, d) => { try { const v = store && store.getItem("lye:" + k); return v == null ? d : v; } catch (e) { return d; } };
const forget = k => { try { store && store.removeItem("lye:" + k); } catch (e) {} };

let clave = recall("clave", "");

async function api(accion, extra) {
  let j;
  try {
    const res = await fetch(API_URL, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify(Object.assign({accion, clave}, extra || {}))});
    j = await res.json();
  } catch (e) { throw {error: "red"}; }
  if (!j || j.error) throw (j || {error: "red"});
  return j.data;
}

/* ---------- acceso con clave (usa el bloque #gate de cada página) ---------- */
const $ = s => document.querySelector(s);
let creando = false;
function olvidarClave() { clave = ""; forget("clave"); }
function mostrarGate(msg, crear) {
  creando = !!crear;
  $("#gate").hidden = false;
  $("#gateText").textContent = crear ? "Primera vez: creá la clave del panel. Vas a usarla en cada dispositivo donde lo abras." : "Ingresá la clave del panel.";
  $("#gateRepWrap").hidden = !crear;
  $("#gateRep").required = !!crear;
  $("#gateClave").autocomplete = crear ? "new-password" : "current-password";
  $("#gateBtn").textContent = crear ? "Crear clave y entrar" : "Entrar";
  $("#gateErr").textContent = msg || "";
  setTimeout(() => $("#gateClave").focus(), 30);
}
function iniciarGate(alEntrar) {
  $("#gateForm").addEventListener("submit", async e => {
    e.preventDefault();
    const nueva = $("#gateClave").value;
    if (nueva.length < 6) { $("#gateErr").textContent = "La clave tiene que tener al menos 6 caracteres."; return; }
    if (creando && nueva !== $("#gateRep").value) { $("#gateErr").textContent = "Las dos claves no coinciden."; return; }
    $("#gateBtn").disabled = true; $("#gateErr").textContent = "";
    clave = nueva;
    try {
      const data = await api(creando ? "crearClave" : "estado");
      remember("clave", nueva); $("#gate").hidden = true; $("#gateClave").value = ""; $("#gateRep").value = "";
      alEntrar(data, creando);
    } catch (err) {
      const c = err && err.error;
      if (c === "clave") { clave = ""; $("#gateErr").textContent = "La clave no es correcta."; }
      else if (c === "sin_clave") { clave = ""; mostrarGate("", true); }
      else if (c === "bloqueado") $("#gateErr").textContent = "Demasiados intentos. Esperá 10 minutos.";
      else $("#gateErr").textContent = "No pude conectar con la planilla. Revisá internet.";
    } finally { $("#gateBtn").disabled = false; }
  });
}

/* ---------- formatos ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const ars = n => (n < 0 ? "-$" : "$") + Math.round(Math.abs(+n || 0)).toLocaleString("es-AR");
const int = n => Math.round(+n || 0).toLocaleString("es-AR");
const pct = x => isFinite(x) ? (x * 100).toLocaleString("es-AR", {minimumFractionDigits: 0, maximumFractionDigits: 1}) + "%" : "–";
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

const CAT_ORDER = ["Tubito 35ml", "Mini 30ml", "Perfume", "Body splash 250ml"];
const catColor = c => { const i = CAT_ORDER.indexOf(c); return i >= 0 ? "var(--c" + (i + 1) + ")" : "var(--c-otro)"; };
// Categoría del catálogo del proveedor -> categoría del stock
const catDeProveedor = c => ({"Tubitos 35 ml": "Tubito 35ml", "Minis 30 ml": "Mini 30ml", "Body splash": "Body splash 250ml",
  "Perfumes árabes": "Perfume", "Árabes 50 ml": "Perfume", "Símil diseñador": "Perfume", "Decants 5 ml": "Perfume"}[c] || c);

/* ---------- catálogo del proveedor (nombres y fotos) ---------- */
let catalogo = [], porNombre = new Map();
async function cargarCatalogo() {
  try { const r = await fetch("catalogo/proveedor.json"); catalogo = await r.json(); } catch (e) { catalogo = []; }
  porNombre = new Map(catalogo.map(p => [norm(p.n), p]));
  return catalogo;
}
// Foto elegida en la planilla o, si no hay, la del catálogo con el mismo nombre.
function fotoDe(p) {
  if (p.foto) return p.foto;
  const c = porNombre.get(norm(p.nombre));
  return c ? c.img : "";
}
function buscarEnCatalogo(q, max) {
  const t = norm(q).split(" ").filter(Boolean);
  if (!t.length) return [];
  return catalogo.filter(p => { const n = norm(p.n + " " + p.c); return t.every(w => n.includes(w)); }).slice(0, max || 40);
}

/* ---------- stock y precio de cada producto (mismo criterio en todas las páginas) ---------- */
function calcular(d) {
  const vend = new Map(), reserv = new Map();
  for (const v of d.ventas || []) for (const it of v.items || []) {
    const k = it.nombre || it.pid; vend.set(k, (vend.get(k) || 0) + (+it.cant || 0));
  }
  for (const p of d.pedidos || []) if (p.estado === "Pendiente") for (const it of p.items || []) {
    reserv.set(it.nombre, (reserv.get(it.nombre) || 0) + (+it.cant || 0));
  }
  const cfg = d.config || {}, m = +cfg.markup || 0, r = Math.max(1, +cfg.redondeo || 1);
  return (d.productos || []).map(p => {
    const costo = +p.costo || 0;
    const sugerido = Math.ceil(+(costo * (1 + m) / r).toFixed(6)) * r;
    const propio = p.precioVenta != null && p.precioVenta !== "" && isFinite(+p.precioVenta);
    const precio = propio ? +p.precioVenta : sugerido;
    const pendiente = p.recibido == null;
    const base = pendiente ? (+p.pedido || 0) : (+p.recibido || 0);
    const vendidos = vend.get(p.nombre) || 0;
    const stock = base - vendidos;
    const gan = precio - costo;
    return {...p, id: p.nombre, costo, sugerido, precio, propio, pendiente, base, vendidos, stock, gan,
            margen: precio > 0 ? gan / precio : 0, reservado: reserv.get(p.nombre) || 0, img: fotoDe(p)};
  });
}

window.LYE = {
  API_URL, api, remember, recall, forget,
  get clave() { return clave; },
  olvidarClave, mostrarGate, iniciarGate,
  esc, ars, int, pct, norm, CAT_ORDER, catColor, catDeProveedor,
  cargarCatalogo, fotoDe, buscarEnCatalogo, get catalogo() { return catalogo; },
  calcular
};
})();
