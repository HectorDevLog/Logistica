/* ==========================================================================
   Sistema de Rentabilidad · Distribución
   © 2026 Héctor Torres. Todos los derechos reservados.
   ========================================================================== */
/* ==========================================================================
   Configuración
   --------------------------------------------------------------------------
   Único archivo que se toca al mover el sistema de un entorno a otro.
   Ninguna pantalla tiene direcciones escritas dentro.
   ========================================================================== */
const CONFIG = {

  /* Apps Script publicado sobre la hoja «Simulador Rentabilidad» de Drive.
     Para cambiar de base, se cambia solo esta línea.
     Debe estar implementado como: ejecutar «Yo» · acceso «Cualquier usuario». */
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxRTvqz6nl5ksOCaNSQZ9vaue2Nl85tqp33kBCDo9NovyxCyskAKhiM7uRqBnAIaBFK/exec',

  /* Nombre visible del sistema. */
  APP_NOMBRE: 'Rentabilidad',
  APP_AREA:   'Distribución',

  /* Autoría. Sale en el pie de todas las pantallas, en el PDF del dashboard
     y en la cabecera de cada archivo de código. Se cambia aquí y cambia en
     todos lados. */
  AUTOR: 'Héctor Torres',
  ANIO: 2026,

  /* Minutos que se reutiliza una descarga del monitor antes de volver a pedirla.
     El monitor pesa varios miles de filas; sin esto cada pantalla lo bajaría entero. */
  MINUTOS_CACHE: 3,

  /* Pasados los minutos de arriba el dato ya no se considera fresco, pero se
     sigue mostrando de inmediato mientras por detrás se pide el nuevo. Solo
     cuando se pasa de ESTE tiempo se hace esperar a la persona.
     Si el dato cambió, la pantalla lo avisa y ofrece recargar. */
  MINUTOS_CACHE_TOLERADO: 25,

  /* Bajar el tarifario y el monitor apenas se entra al Inicio, en segundo
     plano, para que el Simulador y la Proyección abran sin espera.
     Ponlo en false si prefieres no gastar llamadas de quien solo entra a mirar. */
  PRECARGA: true,

  /* Minutos de inactividad antes de cerrar la sesión sola. 0 lo desactiva. */
  MINUTOS_INACTIVIDAD: 30,

  /* Ciudades disponibles al despachar. La del usuario viene marcada por defecto. */
  CIUDADES: ['QUITO', 'GUAYAQUIL', 'CUENCA', 'AMBATO', 'MANTA', 'IBARRA'],

  /* Costo por día según el TIPO de vehículo.

     Es el respaldo: lo primero que se mira siempre es la hoja «Tarifario»
     del Drive, que trae el precio de cada placa. Esta tabla solo entra
     cuando la placa no está en esa hoja, y cuando entra la pantalla lo
     marca como «estimado», porque es un promedio, no el contrato de ese
     vehículo. También es la que arma la flota en Proyección.

     Los precios salen de la tabla por tonelaje de la operación.

     Cómo se elige la fila: el monitor escribe el tipo de mil maneras
     («CAMION FURGON 3.5 TON», «CAMION 3,5 T», «FURGONETA 1TON»), así que
     no se compara el texto. Se saca el tonelaje y se toma la primera fila
     cuyo «hasta» lo cubra; los que no tienen tonelaje (moto, furgoneta,
     montacargas) se reconocen por palabra. Un tonelaje entre dos filas
     —un 12 TN, por ejemplo— sube a la siguiente, nunca baja. */
  TIPOS_VEHICULO: [
    { tipo: 'MOTO',                      costo: 55,     palabras: ['MOTO', 'MOTOCICLETA'] },
    { tipo: 'CAMIONETA / AUTO / FURGONETA', costo: 130,
      palabras: ['CAMIONETA', 'AUTOMOVIL', 'AUTO', 'FURGONETA', 'PICK UP', 'PICKUP', 'CHASIS CHICO'] },
    { tipo: '2,5 a 3,5 TN',              costo: 156.66, hasta: 3.5 },
    { tipo: '5 a 5,5 TN',                costo: 160,    hasta: 5.5 },
    { tipo: '7 a 8 TN',                  costo: 170,    hasta: 8 },
    { tipo: '10 TN',                     costo: 190,    hasta: 10 },
    { tipo: '20 TN',                     costo: 210,    hasta: 20 },
    { tipo: '40 TN',                     costo: 270,    hasta: 40 },
    { tipo: 'MONTACARGAS',               costo: 150,    palabras: ['MONTACARGAS'] },
    { tipo: 'PLATAFORMA',                costo: 150,    palabras: ['PLATAFORMA'] }
  ],

  /* Último recurso: ni la placa está en «Tarifario» ni se reconoce el tipo. */
  COSTO_VEHICULO_POR_DEFECTO: 130,

  /* Todas las tarifas salen de las hojas del Drive: Tfa_Peso, Tfa_Bulto,
     Tfa_Pedido, Tfa_Rango, Tfa_Medida, Tarifa Exclusivos, Trayecto y
     Tarifario. Corriges una celda ahí y el sistema cobra distinto, sin
     tocar código. Lo que queda aquí abajo es lo único que no tiene fila
     donde vivir. */

  /* Respaldo de ZIPPAK. Su cobro real —$82,50 por pallet de 24 cajas— vive
     en la hoja Tfa_Bulto. Esto solo entra si esa fila desapareciera, y
     cuando entra lo avisa en pantalla. Es la regla que estaba escrita en el
     código antes y que no aparece en el relevamiento. */
  REGLA_ZIPPAK: { KG_POR_BLOQUE: 690, PRECIO_BLOQUE: 112.50 },

  /* Movimientos internos: carga que la operación mueve entre sus propias
     bodegas. No se factura, así que va en $0 legítimo —no en rojo ni en
     «Revisar antes de guardar»—. Agrega aquí cualquier otro código propio
     que aparezca en el monitor como si fuera un cliente. */
  CLIENTES_INTERNOS: ['ADM_FLEXNET'],

  /* Reintentos incluidos en el flete que ya se cobró.

     Un pedido que no se entregó vuelve a salir en otra carta porte. El
     sistema lleva registro de lo que ya facturó, así que esas reentregas
     van en $0 en vez de cobrarse dos veces. A partir del intento número
     INTENTOS_INCLUIDOS + 1 —el cuarto, por defecto— ya no está cubierto y
     se vuelve a cobrar la tarifa completa, avisándolo en pantalla. */
  INTENTOS_INCLUIDOS: 3,

  /* Cuándo un «exclusivo» deja de serlo.

     Un pedido marcado EXCLUSIVO que viaja en una carta porte con más de
     estos pedidos normales no ocupó el vehículo: fue consolidado con el
     reparto. Cobrarle el camión entero sería cobrarlo dos veces, porque el
     camión ya lo pagan los demás. En ese caso se cobra la columna de
     tonelaje más baja que tenga esa ruta. */
  EXCLUSIVO_CONSOLIDADO_DESDE: 5,

  /* A partir de este peso un pedido se cobra como exclusivo aunque el monitor
     no lo diga, porque de hecho ocupa el vehículo entero. */
  KG_PARA_EXCLUSIVO: 500,

  /* Techo de cualquier cobro normal.

     Ningún pedido cobrado por peso, bulto, pedido o rango puede salir más
     caro que alquilarle al cliente el vehículo entero en esa misma ruta. Si
     lo supera, se cobra el exclusivo MÁS BARATO que tenga esa ruta —la
     columna de tonelaje más baja con precio— y la pantalla lo avisa con el
     número que daba antes.

     Se topa por viaje, antes de multiplicar por visitas fallidas.
     Ponlo en false para volver a cobrar la tarifa tal cual sale de la tabla. */
  TOPE_EXCLUSIVO: true,

  /* Cuando ninguna tabla tiene tarifa para un pedido, entra este valor en vez
     de cero. Un cero hunde el margen de la carta porte entera y da un número
     que nadie se cree; esto deja una estimación defendible mientras se
     corrige. El pedido igual queda marcado en rojo, encabezando su carta
     porte, y aparece en «Revisar antes de guardar». NO es una tarifa real:
     es un tapón para que el total sirva de algo mientras tanto. */
  TARIFA_PROVISIONAL: { NORMAL: 3.50, EXCLUSIVO: 40 },

  /* Nombres de cliente escritos distinto entre hojas.
     El motor compara exacto, así que sin esto la tarifa no se encuentra y el
     pedido cae en cero. Lo correcto es corregir la hoja; mientras tanto, aquí
     se declara la equivalencia. Izquierda: como está escrito. Derecha: el bueno.

     Detectados al cruzar Tfa_Peso contra Tarifa Exclusivos:               */
  ALIAS_CLIENTES: {
    'ASSA BLOY': 'ASSA ABLOY',
    'SCHNEIDER': 'SHNEIDER'
  }
};

/* Un `const` en el nivel superior de un script NO crea window.CONFIG, así que
   el resto de archivos no lo vería. Se expone de forma explícita. */
window.CONFIG = CONFIG;
