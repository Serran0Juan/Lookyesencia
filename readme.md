# Panel Look y Estilo

Herramienta interna para administrar el emprendimiento de perfumes. Es un sitio estático que se
publica en Vercel y guarda todo en la planilla de Google "Control de stock y margenes", a través
de un Apps Script. No es una tienda: lo usa solo el dueño, con clave.

## Páginas

- `index.html` — **Gestión**: resumen, vender, pedidos de clientes, stock y precios, ventas y gastos.
- `catalogo.html` — **Catálogo**: lo que hay en stock con foto, nombre y precio de venta. Tiene un
  botón para copiar la lista de precios y pegarla en WhatsApp.

Las dos piden la misma clave y comparten `assets/comun.js` (conexión con la planilla, clave,
formatos, cálculo de stock y precio, y fotos).

## Pedidos

Los pedidos los carga el dueño cuando un cliente le pide algo: cliente, contacto, dónde, seña y
productos (pueden ser productos del stock o cualquier otro). El panel muestra si alcanza el stock,
qué falta conseguir y, al entregar, registra la venta. Se guardan en la hoja **Pedidos**.

## Fotos y nombres

`catalogo/proveedor.json` y `img/productos/` salen del catálogo del repositorio Perfumesweb2
(solo se copiaron nombres, categorías y fotos; ese repositorio no se modifica). La foto de cada
producto se guarda en la columna **Foto** (V) de Inventario; si está vacía, se usa la del catálogo
con el mismo nombre. Desde *Stock y precios* se cambia tocando la miniatura.

## Planilla y script

- `apps-script/Code.gs` — va dentro de la planilla (Extensiones > Apps Script). Lee y escribe
  **Inventario** (Recibido, Tu precio, Foto) y usa las hojas **Ventas**, **Gastos** y **Pedidos**,
  que crea solo la primera vez.
- La planilla usa `;` para separar argumentos de fórmulas; el script lo detecta solo.

Después de editar `Code.gs` en el editor: Implementar > Gestionar implementaciones > editar
(lápiz) > Versión: nueva versión > Implementar. La URL `/exec` no cambia.

## Clave

La primera vez que se abre el panel pide crear una clave (mínimo 6 caracteres). Queda guardada en
el script como hash; en cada dispositivo se ingresa una vez. Para cambiarla: en el editor de Apps
Script, Configuración del proyecto > Propiedades del script, borrar `CLAVE_HASH` y volver a abrir
el panel.
