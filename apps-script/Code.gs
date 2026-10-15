/**
 * Look y Estilo — API del panel sobre la planilla "Control de stock y margenes".
 *
 * Va pegado en Extensiones > Apps Script de la planilla y se implementa como
 * Aplicación web (Ejecutar como: yo · Acceso: cualquier usuario). Todas las
 * llamadas exigen la clave del panel; la primera vez el panel la crea.
 *
 * Hojas que usa:
 *   Inventario  productos (Recibido = F, Vendidos = G, Tu precio = O)
 *   Resumen     B4 markup objetivo, B5 redondeo
 *   Ventas      una fila por producto vendido (la crea sola)
 *   Gastos      una fila por gasto (la crea sola)
 */

const INV = 'Inventario', RES = 'Resumen', VEN = 'Ventas', GAS = 'Gastos';
const PRIMERA = 5;   // primera fila de productos en Inventario
const ANCHO = 21;    // columnas A:U de Inventario
const C = {factura: 1, categoria: 2, codigo: 3, nombre: 4, pedido: 5, recibido: 6, vendidos: 7,
           lista: 10, desc: 11, costo: 12, precio: 15};
const VEN_HEAD = ['ID venta', 'Fecha', 'Medio de pago', 'Cliente', 'Nota', 'Producto', 'Categoría',
                  'Cantidad', 'Precio unit. ($)', 'Costo unit. ($)', 'Subtotal ($)', 'Ganancia ($)', 'Registrada'];
const GAS_HEAD = ['ID gasto', 'Fecha', 'Concepto', 'Monto ($)', 'Registrado'];

function doGet() {
  return salida_({ok: true, mensaje: 'API del panel Look y Estilo. Usá POST.'});
}

function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return salida_({error: 'json'}); }
  return manejar_(req);
}

function manejar_(req) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const props = PropertiesService.getScriptProperties();
    const cache = CacheService.getScriptCache();
    const fallos = Number(cache.get('fallos') || 0);
    if (fallos >= 10) return salida_({error: 'bloqueado'});

    const guardada = props.getProperty('CLAVE_HASH');
    const accion = String(req.accion || 'estado');
    if (!guardada) {
      if (accion !== 'crearClave') return salida_({error: 'sin_clave'});
      if (String(req.clave || '').length < 6) return salida_({error: 'clave_corta'});
      props.setProperty('CLAVE_HASH', hash_(req.clave));
    } else if (hash_(req.clave || '') !== guardada) {
      if (req.clave) cache.put('fallos', String(fallos + 1), 600);
      return salida_({error: 'clave'});
    }

    prepararHojas_();
    switch (accion) {
      case 'estado': case 'crearClave': break;
      case 'setProducto': setProducto_(req); break;
      case 'recibirTodo': recibirTodo_(); break;
      case 'addProducto': addProducto_(req); break;
      case 'addVenta': addVenta_(req); break;
      case 'delVenta': borrarPorId_(VEN, req.id); break;
      case 'addGasto': addGasto_(req); break;
      case 'delGasto': borrarPorId_(GAS, req.id); break;
      case 'setConfig': setConfig_(req); break;
      default: return salida_({error: 'accion'});
    }
    SpreadsheetApp.flush();
    return salida_({ok: true, data: estado_()});
  } catch (err) {
    return salida_({error: 'servidor', detalle: String((err && err.message) || err)});
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ---------- lectura ---------- */

function estado_() {
  const ss = SpreadsheetApp.getActive();
  const inv = ss.getSheetByName(INV);
  const ultima = ultimaFila_(inv);
  const filas = ultima >= PRIMERA ? inv.getRange(PRIMERA, 1, ultima - PRIMERA + 1, ANCHO).getValues() : [];
  const productos = filas.map((f, i) => ({
    orden: i + 1,
    factura: f[C.factura - 1],
    categoria: String(f[C.categoria - 1]),
    codigo: String(f[C.codigo - 1]),
    nombre: String(f[C.nombre - 1]),
    pedido: num_(f[C.pedido - 1]),
    recibido: f[C.recibido - 1] === '' ? null : num_(f[C.recibido - 1]),
    precioLista: num_(f[C.lista - 1]),
    desc: num_(f[C.desc - 1]),
    costo: num_(f[C.costo - 1]),
    precioVenta: f[C.precio - 1] === '' ? null : num_(f[C.precio - 1])
  }));

  const res = ss.getSheetByName(RES);
  const config = {markup: num_(res.getRange('B4').getValue()), redondeo: num_(res.getRange('B5').getValue()) || 100};

  const ventas = [], porId = {};
  const vs = ss.getSheetByName(VEN);
  if (vs.getLastRow() > 1) {
    vs.getRange(2, 1, vs.getLastRow() - 1, VEN_HEAD.length).getValues().forEach(f => {
      const id = String(f[0]); if (!id) return;
      let v = porId[id];
      if (!v) {
        v = porId[id] = {id: id, fecha: texto_(f[1]), medio: String(f[2]), cliente: String(f[3]), nota: String(f[4]),
                         creado: Date.parse(texto_(f[12])) || 0, items: [], total: 0, costo: 0};
        ventas.push(v);
      }
      const it = {pid: String(f[5]), nombre: String(f[5]), categoria: String(f[6]), cant: num_(f[7]), precio: num_(f[8]), costo: num_(f[9])};
      v.items.push(it); v.total += it.cant * it.precio; v.costo += it.cant * it.costo;
    });
  }

  const gastos = [];
  const gs = ss.getSheetByName(GAS);
  if (gs.getLastRow() > 1) {
    gs.getRange(2, 1, gs.getLastRow() - 1, GAS_HEAD.length).getValues().forEach(f => {
      if (!f[0]) return;
      gastos.push({id: String(f[0]), fecha: texto_(f[1]), concepto: String(f[2]), monto: num_(f[3]), creado: Date.parse(texto_(f[4])) || 0});
    });
  }
  return {productos: productos, ventas: ventas, gastos: gastos, config: config, planilla: ss.getUrl()};
}

/* ---------- escritura ---------- */

function setProducto_(req) {
  const inv = SpreadsheetApp.getActive().getSheetByName(INV);
  const fila = filaDe_(inv, req.nombre);
  if ('recibido' in req) inv.getRange(fila, C.recibido).setValue(req.recibido == null ? '' : entero_(req.recibido));
  if ('precioVenta' in req) inv.getRange(fila, C.precio).setValue(req.precioVenta == null ? '' : entero_(req.precioVenta));
}

function recibirTodo_() {
  const inv = SpreadsheetApp.getActive().getSheetByName(INV);
  const ultima = ultimaFila_(inv);
  if (ultima < PRIMERA) return;
  const n = ultima - PRIMERA + 1;
  const ped = inv.getRange(PRIMERA, C.pedido, n, 1).getValues();
  const rec = inv.getRange(PRIMERA, C.recibido, n, 1).getValues();
  inv.getRange(PRIMERA, C.recibido, n, 1).setValues(rec.map((f, i) => [f[0] === '' ? ped[i][0] : f[0]]));
}

function addProducto_(req) {
  const nombre = limpio_(req.nombre, 80), categoria = limpio_(req.categoria, 40);
  const costo = entero_(req.costo), cant = entero_(req.cant);
  if (!nombre || !categoria || !(cant >= 1) || !(costo >= 0)) throw new Error('Faltan datos del producto');
  const inv = SpreadsheetApp.getActive().getSheetByName(INV);
  if (buscarFila_(inv, nombre)) throw new Error('Ya existe un producto con ese nombre');
  const ultima = ultimaFila_(inv);
  // Insertar dentro del rango para que los totales y resúmenes lo incluyan.
  inv.insertRowBefore(ultima);
  inv.getRange(ultima + 1, 1, 1, ANCHO).copyTo(inv.getRange(ultima, 1, 1, ANCHO));
  const r = ultima + 1;
  inv.getRange(r, 1, 1, 6).setValues([['Manual', categoria, limpio_(req.codigo, 40), nombre, cant, req.recibido ? cant : '']]);
  inv.getRange(r, C.lista, 1, 2).setValues([[costo, 0]]);
  inv.getRange(r, C.precio).setValue(req.precioVenta == null || req.precioVenta === '' ? '' : entero_(req.precioVenta));
}

function addVenta_(req) {
  const items = Array.isArray(req.items) ? req.items : [];
  if (!items.length) throw new Error('La venta no tiene productos');
  const ss = SpreadsheetApp.getActive(), inv = ss.getSheetByName(INV), vs = ss.getSheetByName(VEN);
  const id = 'V' + Date.now();
  const fecha = fecha_(req.fecha), creado = new Date().toISOString();
  const filas = items.map(it => {
    const fila = filaDe_(inv, it.nombre);
    const costo = num_(inv.getRange(fila, C.costo).getValue());
    return [id, fecha, limpio_(req.medio, 30) || 'Efectivo', limpio_(req.cliente, 80), limpio_(req.nota, 200),
            String(it.nombre), String(inv.getRange(fila, C.categoria).getValue()),
            Math.max(1, entero_(it.cant)), Math.max(0, entero_(it.precio)), costo, '', '', creado];
  });
  agregarFilas_(vs, filas, ['=RC[-3]*RC[-2]', '=RC[-1]-RC[-4]*RC[-2]'], 11);
}

function addGasto_(req) {
  const concepto = limpio_(req.concepto, 80), monto = entero_(req.monto);
  if (!concepto || !(monto > 0)) throw new Error('Faltan datos del gasto');
  const gs = SpreadsheetApp.getActive().getSheetByName(GAS);
  agregarFilas_(gs, [['G' + Date.now(), fecha_(req.fecha), concepto, monto, new Date().toISOString()]]);
}

function setConfig_(req) {
  const m = Number(req.markup), r = Math.round(Number(req.redondeo));
  if (!(m >= 0) || !(r >= 1)) throw new Error('Configuración inválida');
  const res = SpreadsheetApp.getActive().getSheetByName(RES);
  res.getRange('B4').setValue(m);
  res.getRange('B5').setValue(r);
}

function borrarPorId_(hoja, id) {
  if (!id) throw new Error('Falta el ID');
  const sh = SpreadsheetApp.getActive().getSheetByName(hoja);
  if (sh.getLastRow() < 2) return;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(id)) sh.deleteRow(i + 2);
}

/* ---------- preparación de la planilla (idempotente) ---------- */

function prepararHojas_() {
  const ss = SpreadsheetApp.getActive();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PREPARADA') === '2') return;

  let vs = ss.getSheetByName(VEN);
  if (!vs) vs = crearHoja_(ss, VEN, VEN_HEAD, [16, 12, 15, 16, 26, 28, 18, 10, 14, 14, 13, 13, 22]);
  vs.getRange('B:B').setNumberFormat('@'); vs.getRange('M:M').setNumberFormat('@');
  vs.getRange('I:L').setNumberFormat('"$"#,##0;("$"#,##0);"-"');
  let gs = ss.getSheetByName(GAS);
  if (!gs) gs = crearHoja_(ss, GAS, GAS_HEAD, [16, 12, 32, 14, 22]);
  gs.getRange('B:B').setNumberFormat('@'); gs.getRange('E:E').setNumberFormat('@');
  gs.getRange('D:D').setNumberFormat('"$"#,##0;("$"#,##0);"-"');

  // Pasar los "Vendidos" cargados a mano a la hoja Ventas y dejar la columna con fórmula.
  const inv = ss.getSheetByName(INV);
  const ultima = ultimaFila_(inv);
  if (ultima >= PRIMERA) {
    const n = ultima - PRIMERA + 1;
    const rango = inv.getRange(PRIMERA, 1, n, ANCHO);
    const vals = rango.getValues(), forms = inv.getRange(PRIMERA, C.vendidos, n, 1).getFormulas();
    const hoy = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    const filas = [];
    vals.forEach((f, i) => {
      const vend = num_(f[C.vendidos - 1]);
      if (!forms[i][0] && vend > 0) {
        const precio = f[C.precio - 1] === '' ? num_(f[13]) : num_(f[C.precio - 1]);
        filas.push(['V-planilla-' + (i + 1), hoy, 'Efectivo', '', 'Cargada desde la planilla: revisá fecha y medio de pago',
                    String(f[C.nombre - 1]), String(f[C.categoria - 1]), vend, precio, num_(f[C.costo - 1]), '', '', new Date().toISOString()]);
      }
    });
    if (filas.length) agregarFilas_(vs, filas, ['=RC[-3]*RC[-2]', '=RC[-1]-RC[-4]*RC[-2]'], 11);
    inv.getRange(PRIMERA, C.vendidos, n, 1).setFormulaR1C1("=SUMIFS(Ventas!C8,Ventas!C6,RC4)")
       .setFontColor('#008000').setBackground(null);
    inv.getRange(2, 1).setValue('Celdas amarillas = las completás vos (o desde el panel): Recibido y Tu precio de venta. ' +
                                'Vendidos se calcula solo desde la hoja Ventas.');
  }
  props.setProperty('PREPARADA', '2');
}

function crearHoja_(ss, nombre, head, anchos) {
  const sh = ss.insertSheet(nombre);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setFontColor('#FFFFFF')
    .setBackground('#2F3A4A').setFontFamily('Arial').setWrap(true);
  sh.setFrozenRows(1);
  anchos.forEach((w, i) => sh.setColumnWidth(i + 1, w * 7));
  sh.getRange('A:Z').setFontFamily('Arial');
  return sh;
}

/* ---------- utilidades ---------- */

function agregarFilas_(sh, filas, formulas, colFormula) {
  const desde = sh.getLastRow() + 1;
  sh.getRange(desde, 1, filas.length, filas[0].length).setValues(filas);
  if (formulas) sh.getRange(desde, colFormula, filas.length, formulas.length).setFormulasR1C1(filas.map(() => formulas));
}

function ultimaFila_(inv) {
  const n = Math.max(0, inv.getLastRow() - PRIMERA + 1);
  if (!n) return PRIMERA - 1;
  const col = inv.getRange(PRIMERA, 1, n, 1).getValues();
  let ultima = PRIMERA - 1;
  for (let i = 0; i < col.length; i++) {
    const v = String(col[i][0]);
    if (v === 'Total' || v === '') break;
    ultima = PRIMERA + i;
  }
  return ultima;
}

function buscarFila_(inv, nombre) {
  const ultima = ultimaFila_(inv);
  if (ultima < PRIMERA) return 0;
  const col = inv.getRange(PRIMERA, C.nombre, ultima - PRIMERA + 1, 1).getValues();
  for (let i = 0; i < col.length; i++) if (String(col[i][0]) === String(nombre)) return PRIMERA + i;
  return 0;
}

function filaDe_(inv, nombre) {
  const f = buscarFila_(inv, nombre);
  if (!f) throw new Error('No encontré el producto "' + nombre + '"');
  return f;
}

function fecha_(s) {
  const t = String(s || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t
    : Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function texto_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function num_(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function entero_(v) { return Math.round(num_(v)); }
function limpio_(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

function hash_(clave) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'look-y-estilo:' + String(clave), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
