# Panel Look y Estilo

Panel para controlar stock, precios, márgenes, ventas y gastos del emprendimiento de perfumes.
Es una página estática (`index.html`) que se publica en Vercel y guarda todo en la planilla
de Google "Control de stock y margenes", a través de un Apps Script.

## Cómo está armado

- `index.html` — el panel. La constante `API_URL` apunta a la aplicación web del Apps Script.
- `apps-script/Code.gs` — el script que va dentro de la planilla (Extensiones > Apps Script).
  Lee la hoja **Inventario** y escribe en ella (Recibido, Tu precio de venta), y usa las hojas
  **Ventas** y **Gastos**, que crea solo la primera vez.

## Clave

La primera vez que se abre el panel pide crear una clave (mínimo 6 caracteres). La clave
queda guardada en el script como hash; en cada dispositivo se ingresa una vez.
Para cambiarla: en el editor de Apps Script, Configuración del proyecto > Propiedades del
script, borrar `CLAVE_HASH` y volver a abrir el panel.

## Si cambiás el script

Después de editar `Code.gs` en el editor: Implementar > Gestionar implementaciones > editar
(lápiz) > Versión: nueva versión > Implementar. La URL `/exec` no cambia.
