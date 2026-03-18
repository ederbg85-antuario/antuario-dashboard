// ============================================================
//  DEMO DATA — Conversaciones simuladas para Bandeja de Entrada
//  Se usa cuando el usuario demo no tiene Chatwoot configurado
// ============================================================

const DEMO_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

export function isDemoUser(userId: string): boolean {
  return userId === DEMO_USER_ID
}

// ── Timestamps helpers ───────────────────────────────────────
const now = () => Math.floor(Date.now() / 1000)
const minutesAgo = (m: number) => now() - m * 60
const hoursAgo   = (h: number) => now() - h * 3600
const daysAgo    = (d: number) => now() - d * 86400

// ── Demo Conversations ──────────────────────────────────────
export function getDemoConversations(status: string) {
  const all = [
    // ── Abiertas ──
    {
      id: 9001,
      status: 'open' as const,
      unread_count: 3,
      created_at: daysAgo(5),
      last_activity_at: minutesAgo(8),
      inbox_id: 1,
      labels: ['lead_relevant'],
      meta: {
        sender: { id: 101, name: 'María Torres', email: 'maria.torres@bimbo.com.mx', phone_number: '+525512345001' },
        channel: 'Channel::Whatsapp',
      },
      last_non_activity_message: {
        content: 'Hola Carlos, ¿ya tienen disponibilidad para la activación del 28? Necesito confirmar con mi director antes del viernes.',
        message_type: 0,
        created_at: minutesAgo(8),
      },
    },
    {
      id: 9002,
      status: 'open' as const,
      unread_count: 1,
      created_at: daysAgo(2),
      last_activity_at: minutesAgo(45),
      inbox_id: 1,
      labels: ['lead_potential'],
      meta: {
        sender: { id: 102, name: 'Roberto Sánchez', email: 'r.sanchez@cemex.com', phone_number: '+528111234502' },
        channel: 'Channel::Whatsapp',
      },
      last_non_activity_message: {
        content: 'Me interesa lo que manejan. ¿Podrían enviarme un portafolio de servicios con casos de éxito?',
        message_type: 0,
        created_at: minutesAgo(45),
      },
    },
    {
      id: 9003,
      status: 'open' as const,
      unread_count: 0,
      created_at: daysAgo(1),
      last_activity_at: hoursAgo(3),
      inbox_id: 1,
      labels: ['client'],
      meta: {
        sender: { id: 103, name: 'Ana López Vega', email: 'ana.lopez@banorte.com', phone_number: '+528112345003' },
        channel: 'Channel::Whatsapp',
      },
      last_non_activity_message: {
        content: 'Perfecto, entonces quedamos con 12 promotoras para las 3 sucursales. Te confirmo las direcciones mañana temprano.',
        message_type: 0,
        created_at: hoursAgo(3),
      },
    },
    {
      id: 9004,
      status: 'open' as const,
      unread_count: 2,
      created_at: hoursAgo(6),
      last_activity_at: minutesAgo(22),
      inbox_id: 1,
      labels: [],
      meta: {
        sender: { id: 104, name: 'Luis Fernández', email: '', phone_number: '+525587654321' },
        channel: 'Channel::Whatsapp',
      },
      last_non_activity_message: {
        content: 'Buenas tardes, vi su página y quisiera cotizar una activación para el lanzamiento de un producto nuevo. Somos de la industria farmacéutica.',
        message_type: 0,
        created_at: minutesAgo(22),
      },
    },
    {
      id: 9005,
      status: 'open' as const,
      unread_count: 0,
      created_at: daysAgo(3),
      last_activity_at: hoursAgo(5),
      inbox_id: 1,
      labels: ['lead_relevant'],
      meta: {
        sender: { id: 105, name: 'Claudia Ruiz', email: 'cruiz@liverpool.com.mx', phone_number: '+525543219876' },
        channel: 'Channel::Whatsapp',
      },
      last_non_activity_message: {
        content: 'Ya revisé la propuesta con mi equipo. Nos gusta mucho el concepto, pero necesitamos ajustar el presupuesto de producción. ¿Podemos agendar una llamada?',
        message_type: 0,
        created_at: hoursAgo(5),
      },
    },
    {
      id: 9006,
      status: 'open' as const,
      unread_count: 1,
      created_at: hoursAgo(1),
      last_activity_at: minutesAgo(12),
      inbox_id: 1,
      labels: [],
      meta: {
        sender: { id: 106, name: 'Jorge Martínez', email: '', phone_number: '+525598761234' },
        channel: 'Channel::Whatsapp',
      },
      last_non_activity_message: {
        content: '¿Manejan activaciones en Monterrey también o solo CDMX?',
        message_type: 0,
        created_at: minutesAgo(12),
      },
    },
    // ── Pendientes ──
    {
      id: 9007,
      status: 'pending' as const,
      unread_count: 0,
      created_at: daysAgo(7),
      last_activity_at: daysAgo(2),
      inbox_id: 1,
      labels: ['lead_potential'],
      meta: {
        sender: { id: 107, name: 'Fernanda Castillo', email: 'fcastillo@heineken.com', phone_number: '+525534567890' },
        channel: 'Channel::Whatsapp',
      },
      last_non_activity_message: {
        content: 'Déjame revisarlo con el área de trade marketing y te confirmo la próxima semana.',
        message_type: 0,
        created_at: daysAgo(2),
      },
    },
    {
      id: 9008,
      status: 'pending' as const,
      unread_count: 0,
      created_at: daysAgo(10),
      last_activity_at: daysAgo(4),
      inbox_id: 1,
      labels: ['proposal'],
      meta: {
        sender: { id: 108, name: 'Alejandro Vargas', email: 'alejandro.v@santander.com.mx', phone_number: '+525565432109' },
        channel: 'Channel::Email',
      },
      last_non_activity_message: {
        content: 'Recibido, Carlos. Estamos en proceso de aprobación interna del presupuesto Q2. Les aviso en cuanto tenga luz verde.',
        message_type: 0,
        created_at: daysAgo(4),
      },
    },
    // ── Resueltas ──
    {
      id: 9009,
      status: 'resolved' as const,
      unread_count: 0,
      created_at: daysAgo(30),
      last_activity_at: daysAgo(8),
      inbox_id: 1,
      labels: ['client'],
      meta: {
        sender: { id: 109, name: 'Paola Méndez', email: 'pmendez@bimbo.com.mx', phone_number: '+525578901234' },
        channel: 'Channel::Whatsapp',
      },
      last_non_activity_message: {
        content: '¡Excelente trabajo en la activación! El equipo quedó muy contento con los resultados. Platicamos para el siguiente proyecto.',
        message_type: 0,
        created_at: daysAgo(8),
      },
    },
    {
      id: 9010,
      status: 'resolved' as const,
      unread_count: 0,
      created_at: daysAgo(45),
      last_activity_at: daysAgo(15),
      inbox_id: 1,
      labels: ['lead_irrelevant'],
      meta: {
        sender: { id: 110, name: 'Miguel Ángel Pérez', email: '', phone_number: '+525512340000' },
        channel: 'Channel::Whatsapp',
      },
      last_non_activity_message: {
        content: 'Ah ok, entiendo. Por el momento no nos alcanza el presupuesto. Gracias de todas formas.',
        message_type: 0,
        created_at: daysAgo(15),
      },
    },
  ]

  const filtered = all.filter(c => c.status === status)
  return {
    data: {
      payload: filtered,
      meta: { all_count: filtered.length },
    },
  }
}

// ── Demo Messages per conversation ──────────────────────────
export function getDemoMessages(conversationId: number) {
  const messagesByConv: Record<number, Array<{ id: number; content: string; message_type: number; created_at: number; sender?: { name: string; avatar_url?: string | null }; attachments?: never[] }>> = {
    9001: [
      { id: 90011, content: 'Hola, buenas tardes. Soy María Torres de Grupo Bimbo. Nos recomendaron su agencia para activaciones en punto de venta.', message_type: 0, created_at: daysAgo(5), sender: { name: 'María Torres' } },
      { id: 90012, content: '¡Hola María! Qué gusto saludarte. Claro, manejamos activaciones BTL en punto de venta en todo México. ¿Qué tipo de activación necesitan?', message_type: 1, created_at: daysAgo(5) + 300, sender: { name: 'Carlos Mendoza' } },
      { id: 90013, content: 'Estamos lanzando una nueva línea de pan artesanal y queremos hacer sampling en supermercados de CDMX y zona metropolitana.', message_type: 0, created_at: daysAgo(5) + 1800, sender: { name: 'María Torres' } },
      { id: 90014, content: 'Perfecto, tenemos mucha experiencia en sampling para alimentos. ¿Cuántos puntos de venta tienen en mente y para qué fecha?', message_type: 1, created_at: daysAgo(5) + 2400, sender: { name: 'Carlos Mendoza' } },
      { id: 90015, content: 'Serían aproximadamente 15 tiendas entre Walmart, Chedraui y La Comer. La fecha ideal sería el 28 de este mes.', message_type: 0, created_at: daysAgo(4), sender: { name: 'María Torres' } },
      { id: 90016, content: 'Excelente. Te preparo una propuesta formal con desglose de costos por punto de venta. ¿Te la envío por aquí o prefieres por correo?', message_type: 1, created_at: daysAgo(4) + 600, sender: { name: 'Carlos Mendoza' } },
      { id: 90017, content: 'Por correo mejor, para poder compartirla internamente. Mi correo es maria.torres@bimbo.com.mx', message_type: 0, created_at: daysAgo(3), sender: { name: 'María Torres' } },
      { id: 90018, content: 'Listo, te la envío hoy antes de las 6pm. Incluiré 3 opciones de paquete con diferente alcance.', message_type: 1, created_at: daysAgo(3) + 300, sender: { name: 'Carlos Mendoza' } },
      { id: 90019, content: 'Hola Carlos, ¿ya tienen disponibilidad para la activación del 28? Necesito confirmar con mi director antes del viernes.', message_type: 0, created_at: minutesAgo(8), sender: { name: 'María Torres' } },
    ],
    9002: [
      { id: 90021, content: 'Hola, encontré su página buscando agencias de activaciones BTL. ¿Manejan eventos corporativos?', message_type: 0, created_at: daysAgo(2), sender: { name: 'Roberto Sánchez' } },
      { id: 90022, content: '¡Hola! Sí, manejamos eventos corporativos, ferias industriales, lanzamientos y activaciones B2B. ¿En qué industria están?', message_type: 1, created_at: daysAgo(2) + 600, sender: { name: 'Carlos Mendoza' } },
      { id: 90023, content: 'Somos Cemex. Estamos organizando un evento de innovación en construcción para Q2 y buscamos quien nos apoye con la producción y logística.', message_type: 0, created_at: daysAgo(2) + 1800, sender: { name: 'Roberto Sánchez' } },
      { id: 90024, content: '¡Genial! Hemos trabajado con empresas del sector antes. ¿Cuántos asistentes esperan y en qué ciudad sería?', message_type: 1, created_at: daysAgo(2) + 2400, sender: { name: 'Carlos Mendoza' } },
      { id: 90025, content: 'Me interesa lo que manejan. ¿Podrían enviarme un portafolio de servicios con casos de éxito?', message_type: 0, created_at: minutesAgo(45), sender: { name: 'Roberto Sánchez' } },
    ],
    9003: [
      { id: 90031, content: 'Carlos, ya hablé con el gerente regional. Aprobaron el presupuesto para la activación en 3 sucursales.', message_type: 0, created_at: daysAgo(1), sender: { name: 'Ana López Vega' } },
      { id: 90032, content: '¡Excelente noticia, Ana! ¿Con cuántas promotoras necesitan por sucursal?', message_type: 1, created_at: daysAgo(1) + 600, sender: { name: 'Carlos Mendoza' } },
      { id: 90033, content: 'Idealmente 4 por sucursal, que sean bilingües si es posible porque tenemos clientes internacionales en esas zonas.', message_type: 0, created_at: daysAgo(1) + 1200, sender: { name: 'Ana López Vega' } },
      { id: 90034, content: 'Tenemos personal bilingüe disponible. Serían 12 promotoras en total. Te envío la cotización actualizada.', message_type: 1, created_at: daysAgo(1) + 1800, sender: { name: 'Carlos Mendoza' } },
      { id: 90035, content: 'Perfecto, entonces quedamos con 12 promotoras para las 3 sucursales. Te confirmo las direcciones mañana temprano.', message_type: 0, created_at: hoursAgo(3), sender: { name: 'Ana López Vega' } },
    ],
    9004: [
      { id: 90041, content: 'Buenas tardes, vi su página y quisiera cotizar una activación para el lanzamiento de un producto nuevo. Somos de la industria farmacéutica.', message_type: 0, created_at: minutesAgo(22), sender: { name: 'Luis Fernández' } },
      { id: 90042, content: 'También me gustaría saber si tienen experiencia con regulaciones del sector salud para materiales promocionales.', message_type: 0, created_at: minutesAgo(18), sender: { name: 'Luis Fernández' } },
    ],
    9005: [
      { id: 90051, content: 'Hola Carlos, te escribo de Liverpool. Estamos planeando las activaciones navideñas de este año y nos gustaría trabajar con ustedes.', message_type: 0, created_at: daysAgo(3), sender: { name: 'Claudia Ruiz' } },
      { id: 90052, content: '¡Hola Claudia! Nos encantaría. El año pasado hicimos activaciones navideñas increíbles. ¿Cuántas tiendas tienen en mente?', message_type: 1, created_at: daysAgo(3) + 600, sender: { name: 'Carlos Mendoza' } },
      { id: 90053, content: 'Serían 8 tiendas en CDMX y Guadalajara. Te envío el brief que preparamos.', message_type: 0, created_at: daysAgo(3) + 3600, sender: { name: 'Claudia Ruiz' } },
      { id: 90054, content: 'Recibido. Te preparo la propuesta esta semana con el concepto creativo y desglose por tienda.', message_type: 1, created_at: daysAgo(2), sender: { name: 'Carlos Mendoza' } },
      { id: 90055, content: 'Ya revisé la propuesta con mi equipo. Nos gusta mucho el concepto, pero necesitamos ajustar el presupuesto de producción. ¿Podemos agendar una llamada?', message_type: 0, created_at: hoursAgo(5), sender: { name: 'Claudia Ruiz' } },
    ],
    9006: [
      { id: 90061, content: '¿Manejan activaciones en Monterrey también o solo CDMX?', message_type: 0, created_at: minutesAgo(12), sender: { name: 'Jorge Martínez' } },
    ],
    9007: [
      { id: 90071, content: 'Hola, soy Fernanda de Heineken. Nos interesa hacer activaciones en bares y restaurantes para una campaña de verano.', message_type: 0, created_at: daysAgo(7), sender: { name: 'Fernanda Castillo' } },
      { id: 90072, content: '¡Hola Fernanda! Sí, tenemos experiencia en activaciones on-premise. ¿Cuántos establecimientos y en qué ciudades?', message_type: 1, created_at: daysAgo(7) + 1200, sender: { name: 'Carlos Mendoza' } },
      { id: 90073, content: 'Serían unos 20 en CDMX, Guadalajara y Monterrey. Te envío los detalles por correo.', message_type: 0, created_at: daysAgo(6), sender: { name: 'Fernanda Castillo' } },
      { id: 90074, content: 'Perfecto, ya te envié la propuesta. ¿Tuviste oportunidad de revisarla?', message_type: 1, created_at: daysAgo(3), sender: { name: 'Carlos Mendoza' } },
      { id: 90075, content: 'Déjame revisarlo con el área de trade marketing y te confirmo la próxima semana.', message_type: 0, created_at: daysAgo(2), sender: { name: 'Fernanda Castillo' } },
    ],
    9008: [
      { id: 90081, content: 'Buenos días. Le escribo porque estamos evaluando agencias para nuestras campañas de captación en sucursales para el segundo trimestre.', message_type: 0, created_at: daysAgo(10), sender: { name: 'Alejandro Vargas' } },
      { id: 90082, content: 'Buenos días Alejandro. Trabajamos con varios bancos en campañas de captación. Le envío nuestra propuesta de servicios.', message_type: 1, created_at: daysAgo(10) + 3600, sender: { name: 'Carlos Mendoza' } },
      { id: 90083, content: 'Recibido, Carlos. Estamos en proceso de aprobación interna del presupuesto Q2. Les aviso en cuanto tenga luz verde.', message_type: 0, created_at: daysAgo(4), sender: { name: 'Alejandro Vargas' } },
    ],
    9009: [
      { id: 90091, content: 'Carlos, los resultados de la activación fueron increíbles. 15,000 muestras entregadas y 89% de aceptación.', message_type: 0, created_at: daysAgo(10), sender: { name: 'Paola Méndez' } },
      { id: 90092, content: '¡Qué buena noticia Paola! El equipo hizo un gran trabajo. Te envío el reporte fotográfico completo.', message_type: 1, created_at: daysAgo(10) + 1200, sender: { name: 'Carlos Mendoza' } },
      { id: 90093, content: '¡Excelente trabajo en la activación! El equipo quedó muy contento con los resultados. Platicamos para el siguiente proyecto.', message_type: 0, created_at: daysAgo(8), sender: { name: 'Paola Méndez' } },
    ],
    9010: [
      { id: 90101, content: 'Hola, ¿cuánto cobran por una activación sencilla?', message_type: 0, created_at: daysAgo(45), sender: { name: 'Miguel Ángel Pérez' } },
      { id: 90102, content: 'Hola, depende del alcance. Nuestros paquetes arrancan desde $35,000 MXN. ¿Qué tipo de activación necesitas?', message_type: 1, created_at: daysAgo(45) + 600, sender: { name: 'Carlos Mendoza' } },
      { id: 90103, content: 'Ah ok, entiendo. Por el momento no nos alcanza el presupuesto. Gracias de todas formas.', message_type: 0, created_at: daysAgo(15), sender: { name: 'Miguel Ángel Pérez' } },
      { id: 90104, content: 'Sin problema, aquí estamos cuando lo necesites. ¡Éxito!', message_type: 1, created_at: daysAgo(15) + 300, sender: { name: 'Carlos Mendoza' } },
    ],
  }

  return { payload: messagesByConv[conversationId] ?? [] }
}
