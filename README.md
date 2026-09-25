# Caudal

App de finanzas personales para México.

## Módulos

1. **Presupuesto** — sube estados de cuenta CSV, categoriza movimientos en *costo de vida*, *diversión y recreación* y *ahorro*, y compara contra la meta **50 / 30 / 20**.
2. **Balance general** — concentra saldos de bancos, inversiones y crypto para calcular patrimonio neto.
3. **Conectores** — mapa de automatización para Santander, Mercado Pago, Actinver Trade y Bitso.

## Stack

- React + TypeScript + Vite
- Persistencia local (`localStorage`)
- Tests con Vitest

## Desarrollo

```bash
npm install
npm run dev
npm test
npm run build
```

## Datos de ejemplo

- CSV muestra: `public/sample-estado-cuenta.csv`
- Botón **Cargar ejemplo** en Presupuesto
- Botón **Cargar saldos demo** en Balance

## Conectores (resumen)

| Institución | Automatización | Camino recomendado |
|---|---|---|
| Santander | Parcial | Syncfy SuperNET / CSV manual |
| Mercado Pago | Alta | Syncfy wallet o API de reportes |
| Actinver Trade | Manual | Sin API retail; Syncfy lo dio de baja |
| Bitso | Alta | Trading API oficial o Syncfy |
