# Antuario · operación al frente

## Prioridad vigente de Eder

La entrada es operacional. Tareas en curso, responsables, bloqueos, fechas y cuentas aparecen primero. El panorama financiero/comercial y de marketing se conserva en **Negocio**, accesible en un clic y con regreso explícito a Operación. No apilar todos los tableros en la entrada.

## Identidad

Se conserva la paleta original de Antuario: lila `#e9dbff`, menta `#d1f5e6`, durazno `#ffe5cf`, azul `#dcecff`. Series: lila `#9569df`, azul `#4c9fd6`, durazno `#db9074`, menta `#3ba68d`. Menú negro `#11151d`, selección lila, isotipo blanco. La navegación negra se aplica a todas las áreas.

El color identifica prioridades y áreas; no sirve como decoración adicional. Fondo claro con matiz lila, superficies blancas, contenedores redondeados de 20–24px y sombras suaves. Sin bordes ni franjas decorativas. Se mantienen Geist y la marca existente.

## Jerarquía y disposición

- Título operacional 30px escritorio / 27px móvil; títulos de tareas 15px, metadatos 11–13px, cifras principales 29–34px. No comprimir las tareas para simular una mayor densidad.
- Cabecera de aplicación 56px; menú 224px con una entrada por área en el inicio. Las páginas de área conservan sus accesos detallados.
- Woss usa su imagen original en una tarjeta de resumen a 220–240px en escritorio y 190px en móvil y la gráfica circular de estados tiene un lienzo de 196px, cifras de 39px y leyenda legible.
- Cuatro señales operativas: En curso ahora, Para hoy, Bloqueadas y Sin fecha. Agenda y cuentas junto al estado general debajo. Semana/mes y filtros conservados.
- Negocio se abre desde la cabecera operacional. Su selector de periodo afecta resultados; tareas, equipo y cartera conservan su alcance actual, indicado expresamente.
- En móvil, prioridades en dos columnas y tareas en una columna, con textos legibles y controles táctiles. Evitar desbordamientos de página.

## Datos e interacción

Cada tarea usa su ID original y el mismo editor de Producción/Cuentas. Fechas civiles en CDMX. No inferir horas, fechas, avances o clasificación histórica. Distribución por área atribuye cada ID una sola vez a su área principal.

Privacidad financiera activada al abrir/recargar. El usuario elige mostrar los importes; los gráficos financieros y sus ejes/tooltips se omiten mientras están ocultos. No modifica autorización. Unknown se conserva como Por confirmar, nunca como cero.

Marketing usa observaciones diarias y deja vacíos los días sin datos. No suma usuarios diarios como personas únicas. Ventas muestra propuestas y sus estados reales; no los presenta como un embudo con conversiones atribuidas. Caja, flujo y facturación mantienen definiciones diferentes. Publicidad solo toma reportes completos dentro del periodo; no prorratea rangos.

GSAP: entrada breve de 8px y flotación recurrente de Woss con halo y destellos. Control de pausa/reanudación; limpieza al desmontar, suspensión fuera de pantalla y respeto a movimiento reducido. Ninguna animación debe impedir leer o actuar. Mostrar/ocultar, filtros y navegación responden de inmediato.

## Antes / después / motivo

| Antes | Cambio vigente | Motivo |
| --- | --- | --- |
| Woss de 88px y tarjetas con bordes | Woss de 220px, radios de 20–24px y sombras | Recuperar la presencia de la mascota y el lenguaje de Antuario |
| Sólo cuatro prioridades visibles | Resumen con revisión, vencidas y sin responsable, cada dato abre su filtro | Más información accionable sin añadir otra fila de tarjetas |
| Todos los tableros apilados antes del calendario | Operación inicial; Negocio en otra vista | Eder prioriza ejecutar y considera saturado el panorama anterior |
| Paleta azul/gris ajena a Antuario | Paleta original lila, menta, durazno y azul | Mantener identidad reconocible |
| Menú claro y demasiados enlaces en la entrada | Menú negro con un acceso por área | Contraste y menor ruido |
| Títulos operativos de 13px | Tareas de 15px y cifras de 29–34px | Lectura cómoda |
| Otras áreas desaparecían al priorizar tareas | Negocio mantiene marketing, ventas, finanzas, campañas, contenido, contabilidad y equipo | Conservar cobertura sin competir con la agenda |

## Skills aplicadas

Interface Design, Redesign Existing Projects, UI/UX Pro Max, Emil Design Engineering y GSAP React. El resultado Enterprise Gateway de UI/UX Pro Max se descartó por ser un patrón de landing page; se usaron criterios de legibilidad, composición y verificación de interfaces, con la identidad de Antuario.

## Verificación

Evidencias en `docs/verification/executive-redesign-2026-10-28/`. Navegador aislado con datos simulados y componentes reales; no sesiones ni cookies del usuario. La aceptación visual de Eder sigue pendiente y no se publica por cuenta propia.
