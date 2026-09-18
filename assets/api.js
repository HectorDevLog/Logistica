/* ==========================================================================
   Sistema de Rentabilidad · Distribución
   © 2026 Héctor Torres. Todos los derechos reservados.
   ========================================================================== */
/* ==========================================================================
   Capa de datos
   --------------------------------------------------------------------------
   Las pantallas nunca hablan con la red: le piden datos a API y este resuelve
   contra el Apps Script conectado a la hoja de Drive.

   Todo lo que sabe de la estructura de las hojas vive AQUÍ. Si mañana cambia
   un nombre de columna, se corrige en un solo lugar.
   ========================================================================== */
(function (global) {
  'use strict';

  const CFG = global.CONFIG || {};
  const URL_BASE = CFG.SCRIPT_URL || '';

  /* =====================================================================
     LECTURA TOLERANTE DE COLUMNAS
     Las hojas del monitor han cambiado de nombre de columna con el tiempo
     (Cache_Monitor y Datos_Monitor no son idénticas). En vez de depender de
     la posición, se busca por nombre normalizado probando varios candidatos.
     ===================================================================== */
  const norm = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');

  function campo(fila, candidatos, porDefecto = '') {
    for (const c of candidatos) {
      const k = norm(c);
      if (fila[k] !== undefined && fila[k] !== null && String(fila[k]).trim() !== '') return fila[k];
    }
    return porDefecto;
  }

  /* Nombres reales en la hoja Cache_Monitor (verificados contra Drive). */
  const COL = {
    idPedido:      ['idpedido', 'PEDIDOID', 'ID_PEDIDO'],
    cliente:       ['Cliente'],                       // columna C
    servicio:      ['Tipo_Servicio', 'SERVICIO'],
    operacion:     ['Tipo_Operacion'],
    parroquia:     ['CP', 'Localidad_Destino'],       // «CP» aquí es la parroquia
    ciudad:        ['Localidad'],
    provincia:     ['Provincia'],
    zona:          ['Zona'],
    bultos:        ['cantidad_bultos', 'BULTOS'],
    peso:          ['peso_total_kg', 'PESO'],
    origen:        ['Localidad_Origen', 'ORIGEN'],
    cartaPorte:    ['ULTIMA_CARTA_PORTE', 'CARTA_PORTE', 'CARTAPORTE'],
    fechaCP:       ['FECHA_ULTIMA_CARTA_PORTE'],
    transportista: ['TRANSPORTISTA', 'Expreso'],
    vehiculo:      ['VEHICULO', 'PLACA'],
    incidencias:   ['QTY_INCIDENCIAS'],
    estado:        ['ULTIMO_Evento', 'Estado'],
    fechaEstado:   ['Fecha_ULTIMO_Evento', 'Fecha_Estado'],
    fechaAlta:     ['Fecha_alta'],
    destinatario:  ['Destinatario']
  };

  /* Hoja «Programacion Quito» (y su equivalente por ciudad). La llena
     operaciones cada día: qué vehículo sale, con qué carta porte y a cargo
     de quién. De aquí sale la propuesta de cartas porte del simulador. */
  const COL_PROG = {
    fecha:        ['FECHA'],
    proveedor:    ['PROVEEDOR'],
    placa:        ['PLACAS', 'PLACA'],
    /* La columna del tipo de vehículo está escrita de formas distintas según
       quién armó la hoja de cada ciudad. Se prueban todas las que se han
       visto; si mañana aparece otra, se agrega aquí y ya. */
    tipoCamion:   ['TIPO DE CAMION', 'TIPO DE CAMIÓN', 'TIPO CAMION', 'TIPO CAMIÓN',
                   'TIPO DE VEHICULO', 'TIPO DE VEHÍCULO', 'TIPO VEHICULO',
                   'TIPO VEHÍCULO', 'VEHICULO', 'VEHÍCULO', 'TIPO'],
    conductor:    ['CONDUCTOR'],
    ayudante:     ['AYUDANTE'],
    ruta:         ['RUTA'],
    pedidos:      ['TOTAL DE PEDIDOS', 'TOTAL PEDIDOS'],
    servicio:     ['TIPO DE SERVICIO', 'TIPO SERVICIO'],
    turno:        ['TURNO'],
    cartaPorte:   ['CARTA PORTE', 'CARTAPORTE'],
    destino:      ['DESTINO'],
    contratacion: ['CONTRATACION', 'CONTRATACIÓN'],
    cliente:      ['CLIENTE / CLIENTES', 'CLIENTE'],
    responsable:  ['RESPONSABLE']
  };

  const aNum = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    let s = String(v).replace(/[^0-9.,-]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s) || 0;
  };

  const texto = v => String(v == null ? '' : v).trim();

  /* =====================================================================
     NOMBRES DE PERSONAS ESCRITOS DE MIL MANERAS
     ---------------------------------------------------------------------
     La hoja de costo de personal escribe «JuanMontalvo» y el sistema lo
     tiene como «Juan Montalvo»; otra fila dice «Esteban» y el usuario es
     «esteban». Se compara todo reducido a lo mismo: sin tildes, sin
     espacios y en mayúsculas.
     ===================================================================== */
  const sinTildes = s => String(s == null ? '' : s)
    .replace(/[ÁÀÄÂÃáàäâã]/g, 'A').replace(/[ÉÈËÊéèëê]/g, 'E')
    .replace(/[ÍÌÏÎíìïî]/g, 'I').replace(/[ÓÒÖÔÕóòöôõ]/g, 'O')
    .replace(/[ÚÙÜÛúùüû]/g, 'U').replace(/[Ññ]/g, 'N');

  const llaveNombre = s => norm(sinTildes(s));

  /**
   * Busca en una lista de encargados el que corresponde a esta sesión.
   * Se prueba, en orden, contra el usuario, el nombre completo y el primer
   * nombre. Siempre por igualdad exacta del nombre reducido, nunca por
   * «contiene»: si no, «Esteban» casaría con cualquier «Juan Esteban» y se
   * le cobraría a quien no es.
   */
  function encargadoDe(filas, sesion) {
    if (!sesion || !Array.isArray(filas) || !filas.length) return null;
    const primerNombre = String(sesion.nombre || '').trim().split(/\s+/)[0];
    const candidatos = [sesion.usuario, sesion.nombre, primerNombre]
      .map(llaveNombre).filter(Boolean);

    for (const c of candidatos) {
      const fila = filas.find(f => llaveNombre(f.encargado) === c);
      if (fila) return fila;
    }
    return null;
  }

  /* =====================================================================
     CÓDIGOS PEGADOS DESDE EXCEL
     Una carta porte es 69304, pero Excel la muestra como «69.304» y, según
     la configuración regional, a veces como «69 304». Si se copia una
     columna, cada valor llega en su propia línea y con esa separación de
     miles metida dentro. Antes eso se partía en dos códigos («69» y «304»)
     y no encontraba nada. Aquí se deshace el formato, no el número.
     ===================================================================== */

  /**
   * Un código completo, tal como puede venir escrito.
   *
   * Dos formas alternativas, y el orden importa:
   *   1. Un número con separador de miles — punto, coma o espacio — donde cada
   *      grupo tiene exactamente tres dígitos: «70.173», «70,173», «70 173»,
   *      «1.259.700». El separador NO puede ir seguido de otro dígito, que es
   *      lo que distingue «70,173» (un código) de «70040,70041» (dos).
   *   2. Cualquier otro código suelto, incluidos los que llevan letras o
   *      guiones: «70040», «CP-70041».
   *
   * Se busca así, en vez de partir el texto por comas, porque la coma hace de
   * las dos cosas a la vez: separa códigos en una lista y separa los miles
   * dentro de uno. Partir primero destruía «70,173» antes de poder mirarlo.
   */
  const CODIGO = /\d{1,3}(?:[.,\u00A0 ]\d{3})+(?!\d)|[A-Za-z0-9][A-Za-z0-9\-_/]*/g;
  const ES_AGRUPADO = /^\d{1,3}(?:[.,\u00A0 ]\d{3})+$/;

  /**
   * Texto pegado → lista de códigos limpios, sin repetidos y en orden.
   * Acepta: en columna, separados por coma, por punto y coma, por tabulación
   * (celdas de Excel) o por espacio, con o sin separador de miles.
   */
  function listaDeCodigos(entrada) {
    const texto = String(entrada == null ? '' : entrada).replace(/[\n\r\t;|]+/g, ' ');
    const vistos = new Set();
    const fuera = [];

    (texto.match(CODIGO) || []).forEach(bruto => {
      const t = ES_AGRUPADO.test(bruto)
        ? bruto.replace(/[.,\u00A0\s]/g, '')     // era el separador de miles
        : bruto.trim();
      const limpio = t.toUpperCase();
      if (limpio && !vistos.has(limpio)) { vistos.add(limpio); fuera.push(limpio); }
    });

    return fuera;
  }

  /** Clave con la que se comparan dos códigos: ignora formato y ceros a la
      izquierda, para que «69.304», «69 304» y «069304» sean el mismo. */
  const claveCodigo = v =>
    String(v == null ? '' : v).toUpperCase()
      .replace(/[\s.,\u00A0]/g, '')
      .replace(/^0+(?=\d)/, '');

  function fechaISO(v) {
    if (!v) return '';
    const s = texto(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const p = s.split(' ')[0].split('/');
    if (p.length === 3) {
      if (p[0].length === 4) return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
      return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;   // d/m/aaaa
    }
    return s;
  }

  /* =====================================================================
     TRANSPORTE
     ===================================================================== */
  async function get(accion, params = {}) {
    if (!URL_BASE) throw new Error('Falta configurar SCRIPT_URL en config.js.');

    const u = new global.URL(URL_BASE);
    if (accion) u.searchParams.set('action', accion);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    u.searchParams.set('v', Date.now());

    let r;
    try { r = await fetch(u.toString()); }
    catch (e) { throw new Error('Sin conexión con la base de datos. Revisa tu internet.'); }

    if (!r.ok) throw new Error('El servidor respondió con un error (' + r.status + ').');

    let d;
    try { d = await r.json(); }
    catch (e) { throw new Error('El servidor devolvió una respuesta que no se pudo leer. Suele pasar cuando la implementación del Apps Script no está publicada como «Cualquier usuario».'); }

    if (d && d.status === 'error') throw new Error(d.message || 'Error en el servidor.');
    return d;
  }

  async function post(cuerpo) {
    if (!URL_BASE) throw new Error('Falta configurar SCRIPT_URL en config.js.');
    let r;
    try {
      // text/plain evita el preflight de CORS: Apps Script no responde OPTIONS
      r = await fetch(URL_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(cuerpo)
      });
    } catch (e) { throw new Error('No se pudo guardar: sin conexión con el servidor.'); }

    if (!r.ok) throw new Error('El servidor rechazó el guardado (' + r.status + ').');

    try {
      const d = await r.json();
      if (d && d.status === 'error') throw new Error(d.message || 'Error al guardar.');
      return d;
    } catch (e) {
      if (e instanceof Error && e.message.includes('Error')) throw e;
      return { status: 'success' };
    }
  }

  /* =====================================================================
     CACHÉ DE SESIÓN
     El monitor y el histórico se consultan desde varias pantallas. Se
     guardan unos minutos en memoria para no repetir la descarga entera.
     ===================================================================== */
  const cache = new Map();
  const enVuelo = new Map();          // llave → promesa en curso
  const VIDA = (CFG.MINUTOS_CACHE ?? 3) * 60 * 1000;
  /* Hasta este tiempo el dato viejo se sigue mostrando de inmediato mientras
     por detrás se pide el nuevo. Nadie espera dos segundos mirando un
     spinner por un dato que ya tenemos. */
  const VIDA_TOLERADA = (CFG.MINUTOS_CACHE_TOLERADO ?? 25) * 60 * 1000;
  const PREFIJO = 'rentab.cache.';

  /* Cada llamada a Apps Script cuesta ~2 s fijos, sin importar cuántas filas
     devuelva. Por eso lo que más acelera no es pedir menos datos sino hacer
     menos llamadas: el resultado se guarda en sessionStorage y sobrevive al
     cambio de pantalla. Si no cabe (el monitor puede pesar varios MB), se
     queda solo en memoria y no se rompe nada. */
  function leerPersistido(llave) {
    try {
      const crudo = sessionStorage.getItem(PREFIJO + llave);
      if (!crudo) return null;
      const d = JSON.parse(crudo);
      // Se descarta solo cuando ya no sirve ni para mostrar mientras se
      // revalida; entre VIDA y VIDA_TOLERADA sigue siendo útil.
      if (Date.now() - d.t >= VIDA_TOLERADA) { sessionStorage.removeItem(PREFIJO + llave); return null; }
      return d;
    } catch (e) { return null; }
  }

  function persistir(llave, dato) {
    try { sessionStorage.setItem(PREFIJO + llave, JSON.stringify(dato)); }
    catch (e) { /* sin espacio: sigue viviendo en memoria */ }
  }

  /** Trae el dato de la red una sola vez aunque se lo pidan varias pantallas
      a la vez. Sin esto, abrir el Simulador disparaba dos descargas del
      monitor en paralelo y se pagaban los dos segundos dos veces. */
  function pedirUnaVez(llave, fn) {
    if (enVuelo.has(llave)) return enVuelo.get(llave);

    const p = Promise.resolve()
      .then(fn)
      .then(v => {
        const dato = { t: Date.now(), v };
        cache.set(llave, dato);
        persistir(llave, dato);
        return v;
      })
      .finally(() => enVuelo.delete(llave));

    enVuelo.set(llave, p);
    return p;
  }

  /** Revalida por detrás y avisa a la pantalla solo si el dato cambió. */
  function revalidar(llave, fn, anterior) {
    pedirUnaVez(llave, fn).then(nuevo => {
      try {
        if (JSON.stringify(nuevo) === JSON.stringify(anterior)) return;
      } catch (e) { /* si no se puede comparar, se asume que cambió */ }
      global.dispatchEvent(new CustomEvent('datos:actualizados', { detail: { llave } }));
    }).catch(() => { /* la pantalla ya tiene datos: un fallo de fondo no molesta */ });
  }

  async function conCache(llave, fn) {
    let dato = cache.get(llave);

    if (!dato) {
      dato = leerPersistido(llave);
      if (dato) {
        cache.set(llave, dato);
        // El motor de tarifas vive en memoria: si el tarifario vino del
        // almacenamiento, hay que volver a cargárselo.
        if (llave === 'tarifario' && global.Tarifas) global.Tarifas.cargar(dato.v);
      }
    }

    if (dato) {
      const edad = Date.now() - dato.t;
      if (edad < VIDA) return dato.v;
      if (edad < VIDA_TOLERADA) { revalidar(llave, fn, dato.v); return dato.v; }
    }

    return pedirUnaVez(llave, fn);
  }

  function limpiarCache(llave) {
    if (llave) {
      cache.delete(llave);
      // Si había una descarga en curso, su resultado ya no vale: vuelve a
      // pedirse desde cero en la siguiente consulta.
      enVuelo.delete(llave);
      try { sessionStorage.removeItem(PREFIJO + llave); } catch (e) {}
      return;
    }
    cache.clear();
    enVuelo.clear();
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith(PREFIJO))
        .forEach(k => sessionStorage.removeItem(k));
    } catch (e) {}
  }

  /**
   * Bota lo guardado de esas tablas y las vuelve a bajar EN SEGUNDO PLANO.
   *
   * Después de escribir en la base el dato viejo ya no sirve —mostrarlo
   * sería mentir—, pero tampoco hay por qué hacer esperar a la siguiente
   * pantalla: la descarga se dispara aquí mismo, mientras la persona
   * todavía está viendo el aviso de «Guardado». Así los ~2 s fijos que
   * cuesta Apps Script se pagan cuando no le estorban a nadie, en vez de
   * en la cara de quien abre el Dashboard justo después de guardar.
   */
  function recalentar(llaves) {
    llaves.forEach(k => limpiarCache(k));
    try { API.precargar(llaves); } catch (e) { /* si falla, la pantalla lo pedirá */ }
  }

  /* =====================================================================
     TARIFARIO
     getAllTarifas devuelve las siete tablas de una sola llamada. Como cada
     llamada a Apps Script cuesta ~2 s fijos sin importar el tamaño, traer
     todo junto es más rápido que pedir tabla por tabla.
     ===================================================================== */
    async function tarifario() {
    return conCache('tarifario', async () => {
      const d = await get('getAllTarifas');
      if (global.Tarifas) global.Tarifas.cargar(d);
      cargarCobrados(d && d.db);
      return d;
    });
  }

  /* =====================================================================
     PEDIDOS YA COBRADOS
     ---------------------------------------------------------------------
     Un pedido que no se entregó vuelve a salir al día siguiente en otra
     carta porte. El flete ya se cobró la primera vez: volver a cobrarlo
     factura dos veces el mismo envío. Hasta ahora el sistema no lo sabía,
     porque cada carta porte se calculaba como si el pedido fuera nuevo.

     DB_Simulador ya guarda qué pedidos entraron en cada carta porte y con
     qué tarifa, en la columna «listaIds», con la forma:
         1260842 - ($5.77), 1260851 - ($18.01)
     Esa tabla viaja dentro de getAllTarifas (clave «db»), así que esto no
     cuesta ninguna llamada extra.
     ===================================================================== */
  const cobrados = new Map();   // idPedido -> { fecha, cartaPorte, placa, tarifa }

  /* «1260842 - ($5.77)» -> { id: '1260842', tarifa: 5.77, manual: false }
     «1260842 - ($9.50)M» -> { id: '1260842', tarifa: 9.50, manual: true }

     La «M» al final marca que ese cobro lo escribió una persona desde
     Auditoría, no el motor de tarifas. Va pegada tras el paréntesis, nunca
     dentro del id ni del número, así que ninguna lectura existente del
     campo se entera: el número se sigue leyendo igual porque parseFloat
     corta en el primer carácter que no es parte del número. */
  const MARCA_MANUAL = 'M';
  function partirLista(txt) {
    return String(txt == null ? '' : txt)
      .split(',')
      .map(x => x.trim())
      .filter(Boolean)
      .map(trozo => {
        const corte = trozo.indexOf('-');
        const id = (corte >= 0 ? trozo.slice(0, corte) : trozo).trim();
        const val = corte >= 0 ? trozo.slice(corte + 1) : '';
        const manual = /\)\s*M\s*$/i.test(trozo);
        return { id, tarifa: aNum(String(val).replace(/[()$\s]/g, '')), manual };
      })
      .filter(x => x.id);
  }

  /** Arma el texto de un pedido tal como lo espera LISTA_IDS. Un solo lugar
      para escribirlo evita que cada pantalla lo formatee un poco distinto. */
  function formatoCobro(id, tarifa, manual) {
    return `${id} - ($${(Number(tarifa) || 0).toFixed(2)})${manual ? MARCA_MANUAL : ''}`;
  }

  function cargarCobrados(filas) {
    cobrados.clear();
    (filas || []).forEach(f => {
      partirLista(f.listaIds).forEach(({ id, tarifa }) => {
        const clave = claveCodigo(id);
        if (!clave) return;
        const antes = cobrados.get(clave);
        const fecha = f.fecha || '';

        /* «veces» es en cuántas cartas porte ha salido el pedido. Sirve para
           contar intentos sin depender de las incidencias del monitor: si ya
           salió dos veces, la de hoy es la tercera. */
        const veces = (antes ? antes.veces : 0) + 1;
        /* Y «cobros» es cuántas de esas salidas facturaron algo. Cada cobro
           cubre los intentos incluidos, así que este número es el que dice
           si al de hoy le toca cobrar o ir en cero. */
        const cobros = (antes ? antes.cobros : 0) + (tarifa > 0 ? 1 : 0);

        /* Cuál de las apariciones se guarda. Un pedido que no se entregó sale
           varias veces: la primera se cobró y las siguientes van en $0,00. La
           que manda es SIEMPRE la que facturó, porque es la que dice que este
           envío ya está pagado. Antes ganaba la más antigua a secas, y si la
           de $0,00 caía primera el pedido volvía a cobrarse. */
        const cobra = tarifa > 0;
        const cobraba = antes && antes.tarifa > 0;
        const gana = !antes                              // la primera que llega
                  || (cobra && !cobraba)                 // cobrar le gana a no cobrar
                  || (cobra === cobraba && fecha && fecha < String(antes.fecha)); // si empatan, la más vieja

        cobrados.set(clave, gana
          ? { fecha, cartaPorte: f.cartaPorte || '', placa: f.placa || '', tarifa, veces, cobros }
          : { ...antes, veces, cobros });
      });
    });
    return cobrados.size;
  }

  /** Lo que el sistema ya facturó de este pedido, o null si es la primera vez. */
  function yaCobrado(idPedido, cartaPorteActual) {
    const r = cobrados.get(claveCodigo(idPedido));
    if (!r) return null;
    /* El histórico tiene muchos «1257089 - ($0.00)»: pedidos que quedaron en
       cero porque no tenían tarifa. De esos no se facturó nada, así que no
       bloquean el cobro de hoy. Solo cuenta como cobrado lo que cobró algo. */
    if (!(r.tarifa > 0)) return null;
    /* Si el registro es de ESTA misma carta porte no es un recobro: es la
       carta porte que ya se guardó y se está recalculando. */
    if (cartaPorteActual && claveCodigo(r.cartaPorte) === claveCodigo(cartaPorteActual)) return null;
    return r;
  }

  /* =====================================================================
     CONSOLIDACIÓN
     ---------------------------------------------------------------------
     Un exclusivo que comparte camión con muchos pedidos normales no ocupó
     el vehículo. Para saberlo hace falta mirar la carta porte entera, no
     el pedido suelto, así que se cuenta aquí y se le pasa al motor.

     Se hace en API y no en cada pantalla para que el Simulador y la
     Proyección cuenten igual: las dos llaman a esto antes de calcular.
     ===================================================================== */
  function marcarConsolidados(pedidos) {
    const porCP = new Map();
    (pedidos || []).forEach(p => {
      const cp = claveCodigo(p.cartaPorte);
      if (!cp) return;
      const esExclusivo = String(p.servicio || '').toUpperCase().includes('EXCLUSIVO');
      porCP.set(cp, (porCP.get(cp) || 0) + (esExclusivo ? 0 : 1));
    });
    (pedidos || []).forEach(p => {
      p.normalesEnCP = porCP.get(claveCodigo(p.cartaPorte)) || 0;
    });
    return pedidos;
  }

  /** Tarifa de un pedido. Requiere que el tarifario ya esté cargado. */
  function calcularTarifa(pedido) {
    if (!global.Tarifas || !global.Tarifas.listo()) {
      return { total: 0, sinTarifa: true, origen: '—', detalle: '',
               avisos: ['El tarifario todavía no se ha cargado.'], motivo: 'Tarifario no cargado.' };
    }
    /* La regla del recobro se aplica aquí, en el único sitio por el que
       pasan tanto el Simulador como la Proyección: así las dos pantallas
       dan el mismo número sin tener que acordarse de nada. */
    const previo = pedido.yaCobrado !== undefined
      ? pedido.yaCobrado
      : yaCobrado(pedido.idPedido, pedido.cartaPorte);

    /* Cuántos intentos lleva. El monitor lo dice con sus incidencias, pero
       ese dato falla cuando no se registra la novedad. El histórico da un
       segundo conteo, independiente: cuántas cartas porte lo han llevado.
       Se toma el mayor de los dos, porque quedarse corto significa seguir
       sin cobrar un pedido que ya pasó los intentos incluidos. */
    const porMonitor  = Math.max(1, Math.round(Number(pedido.visitas || pedido.intentos)) || 1);
    const porHistorico = previo ? (Number(previo.veces) || 0) + 1 : 1;

    return global.Tarifas.calcular({
      ...pedido,
      yaCobrado: previo,
      intentos: Math.max(porMonitor, porHistorico),
      visitas:  Math.max(porMonitor, porHistorico)
    });
  }

  /* =====================================================================
     API
     ===================================================================== */
  const API = {
    calcularTarifa,
    tarifario,
    /** Cuenta los pedidos normales de cada carta porte y los anota en la
        lista, para que el motor sepa si un exclusivo iba consolidado. */
    marcarConsolidados,
    /** Qué carta porte ya facturó este pedido, o null si es nuevo. */
    yaCobrado,
    /** Rellena el registro desde las filas de DB_Simulador. Lo llama
        `tarifario()` solo; queda expuesto para poder probarlo. */
    cargarCobrados,
    /** Cuántos pedidos tiene registrados el sistema. Para diagnóstico. */
    cuantosCobrados: () => cobrados.size,
    limpiarCache,
    listaDeCodigos,
    claveCodigo,
    /** Lee y escribe la columna LISTA_IDS de DB_Simulador. Las usan el
        Simulador (al guardar) y la Auditoría (al leer y al corregir). */
    partirLista,
    formatoCobro,

    /**
     * Adelanta las dos descargas grandes mientras la persona todavía está
     * leyendo el Inicio. No bloquea nada y los errores se ignoran: si falla,
     * la pantalla que necesite el dato lo pedirá de nuevo.
     *
     * Es el cambio que más se nota: el costo de Apps Script es fijo (~2 s por
     * llamada), así que la única forma de que el Simulador abra al instante
     * es que la espera ya haya ocurrido antes, cuando nadie la estaba mirando.
     */
    precargar(llaves, ciudad) {
      if (CFG.PRECARGA === false) return;
      const trabajos = {
        tarifario: () => API.tarifario(),
        monitor:   () => API.monitorCompleto(),
        // La ciudad de quien inició sesión, no una fija: precargar la
        // programación de Quito no sirve de nada si trabaja en Guayaquil.
        programacion: () => API.programacion(ciudad || (CFG.CIUDADES || [])[0] || 'QUITO'),
        rutas:     () => API.rutas(),
        proyecciones: () => API.proyecciones()
      };
      const lanzar = () => (llaves || ['tarifario', 'monitor']).forEach(k => {
        if (trabajos[k]) { try { trabajos[k]().catch(() => {}); } catch (e) {} }
      });

      // En reposo, para no competir con el pintado de la pantalla actual.
      if (typeof global.requestIdleCallback === 'function') global.requestIdleCallback(lanzar, { timeout: 1500 });
      else setTimeout(lanzar, 400);
    },

    /* ---------------- Sesión ---------------- */
    async login(usuario, password) {
      const d = await get('login', { usuario, password });
      if (d.status !== 'success') throw new Error(d.message || 'Usuario o contraseña incorrectos.');
      return {
        nombre:   texto(d.nombre),
        usuario:  texto(d.usuario) || texto(usuario),
        rol:      texto(d.rol),
        ciudad:   texto(d.ciudad),
        permisos: texto(d.permisos)
      };
    },

    async permisosDe(login) {
      try {
        const d = await get('getPermisos', { usuario: login });
        return d.status === 'success' ? { rol: texto(d.rol), permisos: texto(d.permisos) } : null;
      } catch (e) { return null; }   // el backend puede no tener aún esta acción
    },

    /* ---------------- Usuarios ---------------- */
    async usuarios() {
      const filas = await get('getUsuarios');
      return (Array.isArray(filas) ? filas : []).map(u => ({
        nombre: texto(u.nombre), usuario: texto(u.usuario), password: texto(u.password),
        rol: texto(u.rol) || 'Ruteador', ciudad: texto(u.ciudad), permisos: texto(u.permisos)
      }));
    },

    async guardarUsuario(u, usuarioOriginal) {
      limpiarCache();
      return post(usuarioOriginal ? { action: 'edit_user', usuarioOriginal, ...u } : { ...u });
    },

    async eliminarUsuario(login) {
      limpiarCache();
      return post({ action: 'delete_user', usuario: login });
    },

    /* ---------------- Monitor (pedidos vivos) ---------------- */
    /** Descarga y normaliza Cache_Monitor. Se cachea: es la consulta más pesada. */
    async monitorCompleto() {
      return conCache('monitor', async () => {
        const d = await get('getMonitorBQ');
        const crudos = d && d.headers ? d.headers : [];
        const claves = crudos.map(norm);

        return (d && d.rows ? d.rows : []).map(fila => {
          const o = {};
          claves.forEach((k, i) => { if (k) o[k] = fila[i]; });

          const parroquia = texto(campo(o, COL.parroquia)).toUpperCase();
          const ciudad    = texto(campo(o, COL.ciudad)).toUpperCase();
          const inc       = aNum(campo(o, COL.incidencias, 0));

          return {
            idPedido:      texto(campo(o, COL.idPedido)),
            cliente:       texto(campo(o, COL.cliente, 'SIN CLIENTE')).toUpperCase(),
            servicio:      texto(campo(o, COL.servicio, 'NORMAL')).toUpperCase(),
            cartaPorte:    texto(campo(o, COL.cartaPorte)),
            destino:       parroquia || ciudad,
            ciudad,
            provincia:     texto(campo(o, COL.provincia)).toUpperCase(),
            origen:        texto(campo(o, COL.origen)).toUpperCase(),
            bultos:        Math.max(1, aNum(campo(o, COL.bultos, 1))),
            peso:          aNum(campo(o, COL.peso, 0)),
            placa:         texto(campo(o, COL.vehiculo)).toUpperCase(),
            transportista: texto(campo(o, COL.transportista, 'GENERAL')).toUpperCase(),
            estado:        texto(campo(o, COL.estado)).toUpperCase(),
            intentos:      inc > 0 ? inc + 1 : 1,
            fecha:         fechaISO(campo(o, COL.fechaCP) || campo(o, COL.fechaAlta))
          };
        }).filter(p => p.idPedido);
      });
    },

    /* La comparación va por `claveCodigo` en los dos lados: da igual que en
       la hoja esté «69304» y la persona haya pegado «69.304». */

    /** Pedidos de una lista de cartas porte. */
    async porCartasPorte(cartas) {
      const set = new Set((cartas || []).map(claveCodigo).filter(Boolean));
      if (!set.size) return [];
      const todos = await API.monitorCompleto();
      return todos.filter(p => set.has(claveCodigo(p.cartaPorte)));
    },

    /** Pedidos de una lista de IDs. */
    async porPedidos(ids) {
      const set = new Set((ids || []).map(claveCodigo).filter(Boolean));
      if (!set.size) return [];
      const todos = await API.monitorCompleto();
      return todos.filter(p => set.has(claveCodigo(p.idPedido)));
    },

    /* ---------------- Programación del día ---------------- */
    /**
     * Filas de la hoja «Programacion <ciudad>», normalizadas.
     * Se cachea aparte del monitor: cambia mucho menos.
     */
    async programacion(ciudad) {
      const llave = 'prog.' + texto(ciudad).toUpperCase();
      return conCache(llave, async () => {
        const d = await get('getProgramacion', { ciudad: texto(ciudad) });
        const claves = (d && d.headers ? d.headers : []).map(norm);

        return (d && d.rows ? d.rows : []).map(fila => {
          const o = {};
          claves.forEach((k, i) => { if (k) o[k] = fila[i]; });
          return {
            fecha:        fechaISO(campo(o, COL_PROG.fecha)),
            proveedor:    texto(campo(o, COL_PROG.proveedor)).toUpperCase(),
            placa:        texto(campo(o, COL_PROG.placa)).toUpperCase(),
            tipoCamion:   texto(campo(o, COL_PROG.tipoCamion)).toUpperCase(),
            conductor:    texto(campo(o, COL_PROG.conductor)).toUpperCase(),
            ruta:         texto(campo(o, COL_PROG.ruta)).toUpperCase(),
            pedidos:      aNum(campo(o, COL_PROG.pedidos, 0)),
            servicio:     texto(campo(o, COL_PROG.servicio)).toUpperCase(),
            turno:        texto(campo(o, COL_PROG.turno)),
            cartaPorte:   texto(campo(o, COL_PROG.cartaPorte)),
            destino:      texto(campo(o, COL_PROG.destino)).toUpperCase(),
            cliente:      texto(campo(o, COL_PROG.cliente)).toUpperCase(),
            responsable:  texto(campo(o, COL_PROG.responsable))
          };
        }).filter(f => f.cartaPorte);
      });
    },

    /**
     * Las cartas porte que le tocan a una persona.
     *
     * El nombre del responsable lo escribe operaciones a mano: unas veces
     * «Esteban», otras «Esteban Paredes», con o sin tilde. Por eso no se
     * compara el texto completo sino palabra por palabra.
     *
     * La regla es que un nombre esté contenido en el otro, NO que compartan
     * una palabra: «Esteban Paredes» y «Klever Paredes» comparten el apellido
     * y son dos personas distintas. Con esta regla, «Esteban» encuentra a
     * Esteban Paredes, pero «Klever Paredes» no.
     */
    mias(filas, sesion, fecha) {
      const CONECTORES = new Set(['DEL', 'LOS', 'LAS', 'DE', 'LA', 'Y']);
      const palabras = t => String(t || '').toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^A-Z0-9]+/)
        .filter(w => w.length >= 3 && !CONECTORES.has(w));

      const mias = new Set(palabras(sesion && sesion.nombre));
      palabras(sesion && sesion.usuario).forEach(w => mias.add(w));
      if (!mias.size) return [];

      const contenido = (a, b) => a.length > 0 && a.every(w => b.has(w));

      return (filas || []).filter(f => {
        if (fecha && f.fecha && f.fecha !== fecha) return false;
        const suyas = palabras(f.responsable);
        if (!suyas.length) return false;
        return contenido(suyas, mias) || contenido([...mias], new Set(suyas));
      });
    },

    /** De lo que se pidió, qué no apareció. Compara con la misma clave. */
    noEncontrados(pedidos, encontrados, campo) {
      const hay = new Set((encontrados || []).map(p => claveCodigo(p[campo])));
      return (pedidos || []).filter(c => !hay.has(claveCodigo(c)));
    },

    /** Mapa parroquia -> tipo de trayecto. Sale del mismo tarifario. */
    async trayectos() {
      await tarifario();
      return global.Tarifas ? global.Tarifas._tablas.trayectoPorParroquia : {};
    },

    /* ---------------- Rutas cerradas ---------------- */
    /**
     * Histórico de DB_Simulador. Se usa la acción por defecto del Apps Script,
     * que es la única que devuelve los costos completos (getAllTarifas solo
     * trae ingresos y dejaría el dashboard sin la mitad del dato).
     */
    async rutas() {
      return conCache('rutas', async () => {
        const filas = await get('');
        return (Array.isArray(filas) ? filas : []).map(r => ({
          fecha:       fechaISO(r.fecha),
          ciudad:      texto(r.ciudad).toUpperCase() || 'SIN CIUDAD',
          cartaPorte:  texto(r.cartaPorte),
          placa:       texto(r.placa).toUpperCase(),
          pedidos:     aNum(r.pedidos),
          ingresos:    aNum(r.ingresos),
          cBase:       aNum(r.cBase),
          cExc:        aNum(r.cExc),
          cAyudantes:  aNum(r.cAyudantes),
          cHE:         aNum(r.cHE),
          tipoRuta:    texto(r.tipoRuta) || 'NORMAL',
          proveedor:   texto(r.proveedor),
          usuario:     texto(r.usuario),
          /* Cuándo se guardó la carta porte (no la fecha de despacho) y el
             peso total que se registró. Los usa la Auditoría. */
          fechaCreacion: texto(r.fechaCreacion),
          pesoTotal:     aNum(r.pesoTotal),
          /* Los pedidos que llevó, con lo que se les cobró. El dashboard lo
             cruza con el monitor para poder filtrar por cliente: DB_Simulador
             no guarda el cliente, solo los ids. */
          listaIds:    texto(r.listaIds),
          idRegistro:  texto(r.idRegistro)
        })).filter(r => r.fecha);
      });
    },

    async guardarRutas(rutas) {
      const r = await post(rutas);
      recalentar(['rutas', 'monitor']);
      return r;
    },

    /**
     * Reescribe lo cobrado de una carta porte ya guardada.
     *
     * La usa la Auditoría cuando hay que corregir la tarifa de un pedido: se
     * manda la lista de pedidos completa —con el nuevo valor de cada uno—,
     * cuántos son y el ingreso que suman, y el Apps Script pisa esas tres
     * celdas de DB_Simulador. El resto de la fila (costos, placa, quién la
     * cargó) no se toca.
     *
     * Va por `update_multi_rutas`, que ya existía para el Simulador, así que
     * no hace falta republicar el Apps Script.
     *
     * @param {{idRegistro:string|number, pedidos:number, ingresos:number, listaIds:string}} cambio
     */
    async actualizarCobros(cambio) {
      if (!cambio || !String(cambio.idRegistro || '').trim()) {
        throw new Error('Esta carta porte no tiene número de registro en la base, ' +
                        'así que no se puede reescribir sin riesgo de pisar otra.');
      }
      const r = await post({
        action: 'update_multi_rutas',
        updates: [{
          idRegistro:      String(cambio.idRegistro),
          nuevosPedidos:   Number(cambio.pedidos) || 0,
          nuevosIngresos:  Math.round((Number(cambio.ingresos) || 0) * 100) / 100,
          nuevaListaIds:   String(cambio.listaIds || '')
        }]
      });
      recalentar(['rutas']);
      return r;
    },

    /* ---------------- Proyecciones ---------------- */
    async proyecciones() {
      return conCache('proyecciones', async () => {
        const filas = await get('getProyecciones');
        return (Array.isArray(filas) ? filas : []).map(f => {
          const o = Object.fromEntries(Object.entries(f).map(([k, v]) => [norm(k), v]));
          return {
            id:        texto(campo(o, ['id', 'ID_PROYECCION', 'id_llave_interna'])),
            fecha:     fechaISO(campo(o, ['fecha', 'FECHA'])),
            ciudad:    texto(campo(o, ['ciudad', 'CIUDAD'])).toUpperCase(),
            pedidos:   aNum(campo(o, ['totalPedidos', 'TOTAL_PEDIDOS', 'PEDIDOS'])),
            ingresos:  aNum(campo(o, ['ingresosProyectados', 'INGRESOS_PROYECTADOS', 'INGRESOS'])),
            costo:     aNum(campo(o, ['costoFlota', 'COSTO_FLOTA', 'COSTOS'])),
            utilidad:  aNum(campo(o, ['utilidad', 'UTILIDAD'])),
            detalle:   texto(campo(o, ['detalleFlota', 'DETALLE_FLOTA'])),
            usuario:   texto(campo(o, ['usuario', 'USUARIO']))
          };
        }).filter(p => p.fecha);
      });
    },

    async guardarProyeccion(p) {
      const r = await post({ action: 'save_proyeccion', ...p });
      recalentar(['proyecciones']);
      return r;
    },

    /* ---------------- Costo fijo de personal ----------------
       La hoja «Costo Personal Operación» le pone a cada encargado de área
       lo que cuesta su gente por día de operación (columna FC DÍA). No es
       un costo del vehículo ni del pedido: se paga por abrir el día, así
       que la Proyección se lo suma una sola vez a cada fecha.

       Viaja dentro de getAllTarifas, así que leerla no cuesta una llamada
       aparte. Si la hoja todavía no existe —o el Apps Script publicado aún
       no la manda— esto devuelve una lista vacía y la Proyección sigue
       funcionando igual, sin ese costo. */
    async costoPersonal() {
      const d = await tarifario();
      const filas = (d && d.costoPersonal) || [];
      return (Array.isArray(filas) ? filas : []).map(f => {
        const o = Object.fromEntries(Object.entries(f).map(([k, v]) => [norm(k), v]));
        return {
          /* «FC DÍA» y «FC DIA» normalizan distinto —norm borra la tilde
             en vez de convertirla—, así que se declaran las dos formas. */
          fc:        aNum(campo(o, ['FC DÍA', 'FC DIA', 'FC', 'COSTO DÍA', 'COSTO DIA', 'COSTO'])),
          area:      texto(campo(o, ['ÁREA', 'AREA', 'ZONA'])),
          encargado: texto(campo(o, ['Encargados', 'ENCARGADO', 'RESPONSABLE']))
        };
      }).filter(x => x.encargado && x.fc > 0);
    },

    /** La fila que le toca a esta persona, o null si no es encargada de
        ningún área (entonces no se le suma ningún costo fijo). */
    async costoPersonalDe(sesion) {
      return encargadoDe(await API.costoPersonal(), sesion);
    },

    encargadoDe,

    /**
     * Le pide al Apps Script que relea AHORA el Excel del monitor, sin esperar
     * al robot de segundo plano. Devuelve si hubo pedidos nuevos.
     *
     * Limpiar el caché del navegador no basta: si Cache_Monitor no se ha
     * vuelto a llenar desde el Excel, volver a pedirlo trae lo mismo.
     */
    async refrescarMonitor() {
      const d = await get('refrescarMonitor');
      limpiarCache();
      return { actualizado: !!(d && d.actualizado), filas: (d && d.filas) || 0 };
    },

    /* ---------------- Diagnóstico ---------------- */
    /** Comprueba de una que el backend responde y que la hoja trae lo esperado. */
    async diagnostico() {
      const salida = { url: URL_BASE, pruebas: [] };
      const probar = async (nombre, fn) => {
        const t0 = Date.now();
        try {
          const detalle = await fn();
          salida.pruebas.push({ nombre, ok: true, ms: Date.now() - t0, detalle });
        } catch (e) {
          salida.pruebas.push({ nombre, ok: false, ms: Date.now() - t0, detalle: e.message });
        }
      };
      await probar('Monitor', async () => {
        const m = await API.monitorCompleto();
        const conCP = m.filter(p => p.cartaPorte).length;
        return `${m.length} pedidos · ${conCP} con carta porte · ${new Set(m.map(p => p.ciudad)).size} ciudades`;
      });
      await probar('Rutas cerradas', async () => `${(await API.rutas()).length} registros`);
      await probar('Usuarios',   async () => `${(await API.usuarios()).length} personas`);
      await probar('Trayectos',  async () => `${Object.keys(await API.trayectos()).length} parroquias`);
      await probar('Proyecciones', async () => `${(await API.proyecciones()).length} guardadas`);
      return salida;
    }
  };

  global.API = API;

  /* =====================================================================
     PRECARGA AUTOMÁTICA
     ------------------------------------------------------------------
     `precargar()` existía pero nadie la llamaba, así que cada pantalla
     pagaba de cero el costo fijo de Apps Script (~2 s por tabla): entrar al
     Simulador, a Proyección o a Auditoría se sentía lento aunque el dato ya
     se hubiera bajado minutos antes en otra pantalla.

     Se dispara aquí, en cuanto este archivo se carga, sin esperar a que la
     pantalla actual pida nada: como TODAS las pantallas cargan api.js, esto
     corre sin importar por cuál se entró, y en reposo (requestIdleCallback),
     así que no compite con el pintado de la pantalla que sí importa ahora.
     Si la sesión no tiene el permiso de un módulo, esa tabla ni se pide.
     ===================================================================== */
  try {
    const sesion = global.FX && FX.leerSesion && FX.leerSesion();
    if (sesion) {
      const permitidos = FX.permisosDe ? FX.permisosDe(sesion) : [];
      const llaves = new Set(['rutas']);
      // El tarifario y el monitor los usan Simulador, Proyección y Auditoría
      if (['simcp', 'proyeccion', 'auditoria'].some(m => permitidos.includes(m))) {
        llaves.add('tarifario'); llaves.add('monitor');
      }
      if (permitidos.includes('simcp'))      llaves.add('programacion');
      if (permitidos.includes('proyeccion')) llaves.add('proyecciones');
      API.precargar([...llaves], sesion.ciudad);
    }
  } catch (e) { /* sin sesión (pantalla de login) o FX no disponible: no hay nada que precargar */ }
})(window);
