# Caudal

App de finanzas personales para México.

## Módulos

1. **Presupuesto** — sube estados de cuenta **CSV o PDF**, categoriza movimientos en *costo de vida*, *diversión y recreación* y *ahorro*, y compara contra la meta **50 / 30 / 20**.
2. **Balance general** — concentra saldos de bancos, inversiones y crypto para calcular patrimonio neto.
3. **Conectores** — mapa de automatización para Santander, Mercado Pago, Actinver Trade y Bitso.

## Stack

- React + TypeScript + Vite
- Persistencia local (`localStorage`)
- Import PDF en el navegador (`pdf.js`) — sin backend
- Tests con Vitest

## Desarrollo

```bash
npm install
npm run dev
npm test
npm run build
```

## Importar estados de cuenta

En **Presupuesto** puedes arrastrar o elegir:

| Tipo | Extensiones | Notas |
|---|---|---|
| CSV | `.csv`, `.txt` | Columnas `fecha, descripcion, monto` o Santander `Fecha, Concepto, Cargo, Abono` |
| PDF | `.pdf` | Texto seleccionable (no escaneo). Filas con fecha + concepto + monto / Cargo-Abono |

El PDF se lee en el cliente (`pdf.js` → texto → mismas transacciones que el CSV). Si el layout no se reconoce, verás un error claro; en ese caso usa CSV.

Para sumar varias cuentas (CSV o PDF), deja desmarcado **Reemplazar todos los movimientos al importar** e importa en secuencia.

## Datos de ejemplo

- CSV: `public/sample-estado-cuenta.csv`, `public/sample-santander.csv`, `public/sample-mercado-pago.csv`
- PDF: `public/sample-santander.pdf`, `public/sample-mercado-pago.pdf`
- Botones **Probar CSV/PDF…** en Presupuesto
- Botón **Cargar saldos demo** en Balance
- Regenerar PDFs de muestra: `npm run fixtures:pdf`

## Conectores (resumen)

| Institución | Automatización | Camino recomendado |
|---|---|---|
| Santander | Parcial | Syncfy SuperNET / CSV manual |
| Mercado Pago | Alta | Syncfy wallet o API de reportes |
| Actinver Trade | Manual | Sin API retail; Syncfy lo dio de baja |
| Bitso | Alta | Trading API oficial o Syncfy |
