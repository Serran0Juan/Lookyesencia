/**
 * Look y Estilo — API del panel sobre la planilla "Control de stock y margenes".
 *
 * Va pegado en Extensiones > Apps Script de la planilla y se implementa como
 * Aplicación web (Ejecutar como: yo · Acceso: cualquier usuario). Todas las
 * llamadas exigen la clave del panel; la primera vez el panel la crea.
 *
 * Hojas que usa:
 *   Inventario  productos (Recibido = F, Vendidos = G, Tu precio = O, Foto = V)
 *   Resumen     B4 markup objetivo, B5 redondeo
 *   Ventas      una fila por producto vendido (la crea sola)
 *   Gastos      una fila por gasto (la crea sola)
 *   Pedidos     una fila por producto pedido por un cliente (la crea sola)
 */

const INV = 'Inventario', RES = 'Resumen', VEN = 'Ventas', GAS = 'Gastos', PED = 'Pedidos';
const PRIMERA = 5;   // primera fila de productos en Inventario
const ANCHO = 22;    // columnas A:V de Inventario
const C = {factura: 1, categoria: 2, codigo: 3, nombre: 4, pedido: 5, recibido: 6, vendidos: 7,
           lista: 10, desc: 11, costo: 12, sugerido: 14, precio: 15, foto: 22};
const VEN_HEAD = ['ID venta', 'Fecha', 'Medio de pago', 'Cliente', 'Nota', 'Producto', 'Categoría',
                  'Cantidad', 'Precio unit. ($)', 'Costo unit. ($)', 'Subtotal ($)', 'Ganancia ($)', 'Registrada'];
const GAS_HEAD = ['ID gasto', 'Fecha', 'Concepto', 'Monto ($)', 'Registrado'];
const PED_HEAD = ['ID pedido', 'Fecha', 'Cliente', 'Contacto', 'Dónde', 'Estado', 'Seña ($)', 'Nota',
                  'Producto', 'Cantidad', 'Precio unit. ($)', 'ID venta', 'Registrado'];
const ESTADOS = ['Pendiente', 'Entregado', 'Cancelado'];
const VERSION_HOJAS = '4';

// Fotos de los productos de la primera compra (salen del catálogo del proveedor).
const FOTOS_INICIALES = {
  'Tubito Tubbees Cherry Luxe': 'tubito-tubbees-cherry-35', 'Tubito Sweet Tooth Celeste': 'tubito-sweet-tooth-35',
  'Tubito Yara Moi': 'tubito-yara-moi-35', 'Tubito Island Blis': 'tubito-island-bliss-35',
  'Tubito Yara Tous': 'tubito-yara-tous-35', 'Tubito Yum Yum': 'tubito-yum-yum-35',
  'Tubito Yara Candy': 'tubito-yara-candy-35', 'Tubito Yara': 'tubito-yara-35',
  'Tubito 9PM Night Out': 'tubito-9pm-night-out-35', 'Tubito Yara Elixir': 'tubito-yara-elixir-35',
  'Tubito Mandarin Sky': 'tubito-mandarin-sky-35', 'Tubito Sweet Food Rosa': 'tubito-sweet-tooth-rosa-35',
  'Tubito Fakhar Rose': 'tubito-fakhar-rose-35', 'Tubito Invictus': 'tubito-invictus-35',
  'Tubito Asad Zanzibar': 'tubito-asad-zanzibar-35', 'Tubito 9PM Rebel': 'tubito-9pm-rebel-35',
  'Tubito Sakeena': 'tubito-sakeena-35', 'Tubito Sublime': 'tubito-sublime-35',
  'Tubito Honor and Glory': 'tubito-honor-and-glory-35', 'Tubito Fakhar Plateado': 'tubito-fakhar-silver-negro-35',
  'Body Splash Bare Vainilla': 'bare-vanilla-250', 'Body Splash Coconut': 'coconut-passion-250',
  'Body Splash Pure Seduction': 'pure-seduction-250', 'Body Splash Aqua Kiss': 'aqua-kiss-250',
  'Asad 50ml': 'asad-clasico-50', '9PM Rebel 50ml': '9pm-rebel-50',
  'Mini Haya': 'mini-haya-30', 'Mini Yara Tous': 'mini-yara-tous-30',
  'Mini Odyssey Marshmellow': 'mini-odyssey-marshmallow-30', 'Mini Yara Mioi': 'mini-yara-moi-30',
  'Mini Qaed Al Fursan Black': 'mini-qaed-al-fursan-negro-30', 'Mini Mandarin Sky': 'mini-mandarin-sky-30',
  'Mini Marshmellow': 'mini-marshmallow-30', 'Mini 9PM Rebel': 'mini-9pm-rebel-30',
  'Mini Mayar Rosa': 'mini-mayar-rosa-30', 'Mini Amber Rouge': 'mini-amber-rouge-30',
  'Mini Fakhar Rose': 'mini-fakhar-rose-30', 'Mini Mayar Celeste': 'mini-mayar-celeste-30',
  'Mini Yara Candy': 'mini-yara-candy-30'
};

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
      case 'setFoto': setFoto_(req); break;
      case 'recibirTodo': recibirTodo_(); break;
      case 'addProducto': addProducto_(req); break;
      case 'addVenta': addVenta_(req); break;
      case 'delVenta': borrarPorId_(VEN, req.id); break;
      case 'addGasto': addGasto_(req); break;
      case 'delGasto': borrarPorId_(GAS, req.id); break;
      case 'addPedido': addPedido_(req); break;
      case 'setPedidoEstado': setPedidoEstado_(req.id, req.estado); break;
      case 'entregarPedido': entregarPedido_(req); break;
      case 'delPedido': borrarPorId_(PED, req.id); break;
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
    precioVenta: f[C.precio - 1] === '' ? null : num_(f[C.precio - 1]),
    foto: String(f[C.foto - 1] || '')
  }));

  const res = ss.getSheetByName(RES);
  const config = {markup: num_(res.getRange('B4').getValue()), redondeo: num_(res.getRange('B5').getValue()) || 100};

  const ventas = [], porId = {};
  filasDe_(ss.getSheetByName(VEN), VEN_HEAD.length).forEach(f => {
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

  const gastos = filasDe_(ss.getSheetByName(GAS), GAS_HEAD.length).filter(f => f[0]).map(f =>
    ({id: String(f[0]), fecha: texto_(f[1]), concepto: String(f[2]), monto: num_(f[3]), creado: Date.parse(texto_(f[4])) || 0}));

  const pedidos = [], pedPorId = {};
  filasDe_(ss.getSheetByName(PED), PED_HEAD.length).forEach(f => {
    const id = String(f[0]); if (!id) return;
    let p = pedPorId[id];
    if (!p) {
      p = pedPorId[id] = {id: id, fecha: texto_(f[1]), cliente: String(f[2]), contacto: String(f[3]), lugar: String(f[4]),
                          estado: String(f[5]) || 'Pendiente', sena: num_(f[6]), nota: String(f[7]), ventaId: String(f[11]),
                          creado: Date.parse(texto_(f[12])) || 0, items: []};
      pedidos.push(p);
    }
    p.items.push({nombre: String(f[8]), cant: num_(f[9]), precio: f[10] === '' ? null : num_(f[10])});
  });

  return {productos: productos, ventas: ventas, gastos: gastos, pedidos: pedidos, config: config, planilla: ss.getUrl()};
}

/* ---------- escritura ---------- */

function setProducto_(req) {
  const inv = SpreadsheetApp.getActive().getSheetByName(INV);
  const fila = filaDe_(inv, req.nombre);
  if ('recibido' in req) inv.getRange(fila, C.recibido).setValue(req.recibido == null ? '' : entero_(req.recibido));
  if ('precioVenta' in req) inv.getRange(fila, C.precio).setValue(req.precioVenta == null ? '' : entero_(req.precioVenta));
}

function setFoto_(req) {
  const inv = SpreadsheetApp.getActive().getSheetByName(INV);
  inv.getRange(filaDe_(inv, req.nombre), C.foto).setValue(rutaFoto_(req.foto));
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
  inv.getRange(r, C.foto).setValue(rutaFoto_(req.foto));
  formulasVendidos_(inv);
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
  return id;
}

function addGasto_(req) {
  const concepto = limpio_(req.concepto, 80), monto = entero_(req.monto);
  if (!concepto || !(monto > 0)) throw new Error('Faltan datos del gasto');
  const gs = SpreadsheetApp.getActive().getSheetByName(GAS);
  agregarFilas_(gs, [['G' + Date.now(), fecha_(req.fecha), concepto, monto, new Date().toISOString()]]);
}

function addPedido_(req) {
  const cliente = limpio_(req.cliente, 80);
  const items = (Array.isArray(req.items) ? req.items : [])
    .map(it => ({nombre: limpio_(it.nombre, 80), cant: entero_(it.cant), precio: it.precio == null || it.precio === '' ? '' : Math.max(0, entero_(it.precio))}))
    .filter(it => it.nombre && it.cant >= 1);
  if (!cliente) throw new Error('Falta el nombre del cliente');
  if (!items.length) throw new Error('El pedido no tiene productos');
  const id = 'P' + Date.now(), creado = new Date().toISOString();
  const sena = Math.max(0, entero_(req.sena));
  const filas = items.map(it => [id, fecha_(req.fecha), cliente, limpio_(req.contacto, 60), limpio_(req.lugar, 120), 'Pendiente',
                                 sena, limpio_(req.nota, 200), it.nombre, it.cant, it.precio, '', creado]);
  agregarFilas_(SpreadsheetApp.getActive().getSheetByName(PED), filas);
}

function setPedidoEstado_(id, estado, ventaId) {
  if (ESTADOS.indexOf(estado) < 0) throw new Error('Estado inválido');
  const sh = SpreadsheetApp.getActive().getSheetByName(PED);
  const filas = filasPorId_(sh, id);
  if (!filas.length) throw new Error('No encontré el pedido');
  filas.forEach(r => {
    sh.getRange(r, 6).setValue(estado);
    if (ventaId !== undefined) sh.getRange(r, 12).setValue(ventaId);
  });
}

function entregarPedido_(req) {
  const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(PED), inv = ss.getSheetByName(INV);
  const filas = filasPorId_(sh, req.id);
  if (!filas.length) throw new Error('No encontré el pedido');
  const datos = filas.map(r => sh.getRange(r, 1, 1, PED_HEAD.length).getValues()[0]);
  if (String(datos[0][5]) === 'Entregado') throw new Error('Ese pedido ya está entregado');
  const faltan = datos.filter(f => !buscarFila_(inv, f[8])).map(f => f[8]);
  if (faltan.length) throw new Error('Para entregarlo, primero agregá al stock: ' + faltan.join(', '));
  const items = datos.map(f => {
    const fila = buscarFila_(inv, f[8]);
    const propio = inv.getRange(fila, C.precio).getValue();
    const precio = f[10] !== '' ? num_(f[10]) : (propio !== '' ? num_(propio) : num_(inv.getRange(fila, C.sugerido).getValue()));
    return {nombre: String(f[8]), cant: num_(f[9]), precio: precio};
  });
  const d = datos[0];
  const nota = ['Pedido', d[4] ? '· ' + d[4] : '', d[7] ? '· ' + d[7] : ''].join(' ').trim();
  const ventaId = addVenta_({fecha: req.fecha, medio: req.medio, cliente: d[2], nota: nota, items: items});
  setPedidoEstado_(req.id, 'Entregado', ventaId);
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
  filasPorId_(sh, id).reverse().forEach(r => sh.deleteRow(r));
}

/* ---------- preparación de la planilla (idempotente) ---------- */

function prepararHojas_() {
  const ss = SpreadsheetApp.getActive();
  const props = PropertiesService.getScriptProperties();
  const version = props.getProperty('PREPARADA');
  if (version === VERSION_HOJAS) return;

  let vs = ss.getSheetByName(VEN);
  if (!vs) vs = crearHoja_(ss, VEN, VEN_HEAD, [16, 12, 15, 16, 26, 28, 18, 10, 14, 14, 13, 13, 22]);
  vs.getRange('B:B').setNumberFormat('@'); vs.getRange('M:M').setNumberFormat('@');
  vs.getRange('I:L').setNumberFormat('"$"#,##0;("$"#,##0);"-"');
  let gs = ss.getSheetByName(GAS);
  if (!gs) gs = crearHoja_(ss, GAS, GAS_HEAD, [16, 12, 32, 14, 22]);
  gs.getRange('B:B').setNumberFormat('@'); gs.getRange('E:E').setNumberFormat('@');
  gs.getRange('D:D').setNumberFormat('"$"#,##0;("$"#,##0);"-"');
  let ps = ss.getSheetByName(PED);
  if (!ps) ps = crearHoja_(ss, PED, PED_HEAD, [16, 12, 18, 16, 24, 12, 11, 24, 28, 10, 14, 16, 22]);
  ps.getRange('B:B').setNumberFormat('@'); ps.getRange('M:M').setNumberFormat('@');
  ps.getRange('G:G').setNumberFormat('"$"#,##0;("$"#,##0);"-"'); ps.getRange('K:K').setNumberFormat('"$"#,##0;("$"#,##0);"-"');

  const inv = ss.getSheetByName(INV);
  if (inv.getMaxColumns() < ANCHO) inv.insertColumnsAfter(inv.getMaxColumns(), ANCHO - inv.getMaxColumns());
  const ultima = ultimaFila_(inv);
  if (ultima >= PRIMERA) {
    const n = ultima - PRIMERA + 1;
    // Una sola vez: pasar los "Vendidos" cargados a mano a la hoja Ventas.
    if (!version) {
      const vals = inv.getRange(PRIMERA, 1, n, ANCHO).getValues(), forms = inv.getRange(PRIMERA, C.vendidos, n, 1).getFormulas();
      const hoy = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      const filas = [];
      vals.forEach((f, i) => {
        const vend = num_(f[C.vendidos - 1]);
        if (!forms[i][0] && vend > 0) {
          const precio = f[C.precio - 1] === '' ? num_(f[C.sugerido - 1]) : num_(f[C.precio - 1]);
          filas.push(['V-planilla-' + (i + 1), hoy, 'Efectivo', '', 'Cargada desde la planilla: revisá fecha y medio de pago',
                      String(f[C.nombre - 1]), String(f[C.categoria - 1]), vend, precio, num_(f[C.costo - 1]), '', '', new Date().toISOString()]);
        }
      });
      if (filas.length) agregarFilas_(vs, filas, ['=RC[-3]*RC[-2]', '=RC[-1]-RC[-4]*RC[-2]'], 11);
    }
    formulasVendidos_(inv);
    inv.getRange(2, 1).setValue('Celdas amarillas = las completás vos (o desde el panel): Recibido y Tu precio de venta. ' +
                                'Vendidos se calcula solo desde la hoja Ventas.');

    // Columna de fotos (V) con las de la primera compra.
    if (String(inv.getRange(4, C.foto).getValue()) !== 'Foto') {
      inv.getRange(4, C.foto - 1).copyTo(inv.getRange(4, C.foto), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      inv.getRange(4, C.foto).setValue('Foto');
      inv.setColumnWidth(C.foto, 230);
    }
    const nombres = inv.getRange(PRIMERA, C.nombre, n, 1).getValues();
    const fotos = inv.getRange(PRIMERA, C.foto, n, 1).getValues();
    inv.getRange(PRIMERA, C.foto, n, 1).setValues(fotos.map((f, i) => {
      if (f[0]) return [f[0]];
      const id = FOTOS_INICIALES[String(nombres[i][0])];
      return [id ? 'img/productos/' + id + '.jpg' : ''];
    })).setFontColor('#0000FF');
  }
  props.setProperty('PREPARADA', VERSION_HOJAS);
}

// Vendidos = suma de la hoja Ventas. La planilla está en un idioma que separa los argumentos
// con ";", así que el separador se averigua probando una fórmula.
function formulasVendidos_(inv) {
  const ultima = ultimaFila_(inv);
  if (ultima < PRIMERA) return;
  const s = separador_();
  const formulas = [];
  for (let r = PRIMERA; r <= ultima; r++) formulas.push(['=SUMIFS(Ventas!$H:$H' + s + 'Ventas!$F:$F' + s + '$D' + r + ')']);
  inv.getRange(PRIMERA, C.vendidos, formulas.length, 1).clearDataValidations().setFormulas(formulas)
     .setFontColor('#008000').setBackground(null);
}

function separador_() {
  const props = PropertiesService.getScriptProperties();
  const guardado = props.getProperty('SEPARADOR');
  if (guardado) return guardado;
  const celda = SpreadsheetApp.getActive().getSheetByName(PED).getRange('Z1');
  celda.setFormula('=SUM(1,2)');
  SpreadsheetApp.flush();
  const s = celda.getValue() === 3 ? ',' : ';';
  celda.clearContent();
  props.setProperty('SEPARADOR', s);
  return s;
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

function filasDe_(sh, ancho) {
  return sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, ancho).getValues() : [];
}

function filasPorId_(sh, id) {
  if (!id || sh.getLastRow() < 2) return [];
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues(), filas = [];
  ids.forEach((f, i) => { if (String(f[0]) === String(id)) filas.push(i + 2); });
  return filas;
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

// Solo se aceptan fotos del catálogo copiado al sitio (img/productos/...).
function rutaFoto_(v) {
  const s = String(v || '').trim();
  return /^img\/productos\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(s) ? s : '';
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
