export type ConnectorStatus = 'listo' | 'parcial' | 'manual'

export type ConnectorInfo = {
  id: string
  name: string
  institution: string
  status: ConnectorStatus
  summary: string
  options: {
    title: string
    detail: string
    link?: string
  }[]
}

export const CONNECTORS: ConnectorInfo[] = [
  {
    id: 'santander',
    name: 'Santander México',
    institution: 'Banco',
    status: 'parcial',
    summary:
      'No hay API pública sencilla para banca personal. La ruta práctica es un agregador (Syncfy) o exportar estados de cuenta CSV/PDF.',
    options: [
      {
        title: 'Syncfy (Paybook)',
        detail:
          'Cubre Santander México SuperNET Particulares y Santander Empresas. Widget OAuth-like para vincular credenciales y leer saldos/movimientos vía API.',
        link: 'https://syncfy.com/coverage/',
      },
      {
        title: 'Exportación manual',
        detail:
          'Desde SuperNET puedes descargar movimientos en CSV/Excel y subirlos al módulo de Presupuesto de Caudal.',
      },
      {
        title: 'Open Banking Santander (CIB / EU)',
        detail:
          'Las APIs Accounts de Santander están orientadas a banca corporativa/Europa (PSD2), no al retail mexicano de consumo personal.',
        link: 'https://apimarket.santandercib.com/scib/external/api/accounts_1_0_0/guide',
      },
    ],
  },
  {
    id: 'mercado-pago',
    name: 'Mercado Pago',
    institution: 'Billetera',
    status: 'listo',
    summary:
      'Dos caminos: Syncfy para leer la billetera personal, o la API oficial de reportes si operas como vendedor/cuenta business.',
    options: [
      {
        title: 'Syncfy — Mercado Pago México',
        detail:
          'Integración de wallet: vinculas la cuenta y consultas transacciones con GET /v1/transactions.',
        link: 'https://syncfy.com/coverage/',
      },
      {
        title: 'API de reportes Account Money',
        detail:
          'Genera y descarga reportes de liquidaciones (pagos, reembolsos, retiros SPEI) con Access Token de desarrollador.',
        link: 'https://www.mercadopago.com.mx/developers/es/docs/reports/account-money/api',
      },
      {
        title: 'Export CSV en la app',
        detail:
          'Desde la app de Mercado Pago puedes exportar actividad y cargarla aquí mientras automatizas el conector.',
      },
    ],
  },
  {
    id: 'actinver',
    name: 'Actinver Trade',
    institution: 'Inversión',
    status: 'manual',
    summary:
      'No publica API de portafolio para clientes retail. Syncfy listaba Actinver pero lo dio de baja en su optimización de octubre 2025.',
    options: [
      {
        title: 'Carga manual en Balance',
        detail:
          'Registra el valor de mercado de tu cuenta Actinver Trade en el módulo Balance general (tipo Inversión).',
      },
      {
        title: 'Estados / extracciones',
        detail:
          'Si exportas movimientos o posiciones desde la plataforma, súbelos como CSV en Presupuesto (depósitos cuentan como Ahorro).',
      },
      {
        title: 'Syncfy (histórico)',
        detail:
          'El sitio Actinver – México fue desactivado en Syncfy (~sep/oct 2025). No conviene depender de él.',
        link: 'https://foros.paybook.com/t/aviso-importante-optimizacion-de-sitios-en-syncfy-update-octubre-2025/861',
      },
    ],
  },
  {
    id: 'bitso',
    name: 'Bitso',
    institution: 'Crypto',
    status: 'listo',
    summary:
      'API oficial robusta (Trading API) con saldos y trades, más cobertura vía Syncfy como wallet digital.',
    options: [
      {
        title: 'Bitso Trading API',
        detail:
          'Endpoints privados firmados (HMAC) para Get Account Balance, user trades y órdenes. Ideal para sincronizar el saldo crypto al Balance.',
        link: 'https://docs.bitso.com/bitso-api/docs/api-overview',
      },
      {
        title: 'Syncfy — Bitso',
        detail:
          'Aparece en cobertura de digital wallets; útil si quieres unificar Santander + MP + Bitso en un solo agregador.',
        link: 'https://syncfy.com/coverage/',
      },
    ],
  },
]

export const AGGREGATOR_RECOMMENDATION = {
  name: 'Syncfy (Paybook)',
  why: 'Es el agregador con mejor cobertura para tu stack en México: Santander, Mercado Pago y Bitso en un solo widget. Actinver ya no está disponible ahí.',
  link: 'https://syncfy.com/',
  nextSteps: [
    'Crear cuenta de desarrollador en Syncfy y obtener API keys',
    'Montar el widget para vincular Santander, Mercado Pago y Bitso',
    'Mapear GET /v1/transactions → categorías Caudal (50/30/20)',
    'Mapear saldos de cuentas → módulo Balance general',
    'Para Actinver: entrada manual o CSV hasta encontrar otro proveedor',
  ],
}
