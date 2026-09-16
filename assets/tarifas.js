/* ==========================================================================
   Sistema de Rentabilidad · Distribución
   © 2026 Héctor Torres. Todos los derechos reservados.
   ========================================================================== */
/* ==========================================================================
   Motor de tarifas
   --------------------------------------------------------------------------
   Calcula lo que se le cobra a un pedido usando las tablas reales de la hoja
   de Drive. Sustituye la fórmula provisional que traía la versión anterior.

   Orden de decisión (el primero que aplica, gana):

     1. EXCLUSIVO       Tarifa Exclusivos, por cliente + origen + destino,
                        eligiendo la columna del TONELAJE DEL VEHÍCULO
     2. Tfa_Bulto       el precio lo manda la cantidad de bultos
     3. Tfa_Medida      reglas especiales (por kg puro, plana, por ATM)
     4. Tfa_Peso        arranque + tarifa + kg adicional
     5. Tfa_Pedido      tarifa fija por cliente + servicio + trayecto
     6. Tfa_Rango       por rango de peso

   Cada fila declara CÓMO se cobra: por envío, por bulto, con bulto adicional
   o agrupando en pallets. Nada de eso está escrito en el código.

   Diferencias respecto al motor anterior, todas deliberadas:

     · Se lee la columna de tonelaje que corresponde al vehículo. El motor
       anterior cobraba siempre «1 TON», lo que subfacturaba cada exclusivo
       despachado en un camión mayor (hasta 4 veces menos en los peores casos).
     · Se respeta la columna SERVICIO de Tfa_Peso: una fila marcada «No pagan»
       cobra cero, en vez de cobrar igual.
     · No existe el trayecto «LOCAL» a secas: las tablas usan LOCAL QUITO y
       LOCAL GUAYAQUIL. Un pedido sin trayecto ya no cae silenciosamente a cero.
     · Cuando no hay tarifa configurada, el resultado es 0 CON MOTIVO, para
       poder mostrarlo en rojo en vez de taparlo con un mínimo automático.
   ========================================================================== */
(function (global) {
  'use strict';

  const norm  = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const texto = s => String(s == null ? '' : s).trim();

  /* Equivalencias de nombre declaradas en config.js, normalizadas una vez. */
  const ALIAS = (() => {
    const crudo = (global.CONFIG && global.CONFIG.ALIAS_CLIENTES) || {};
    const m = {};
    Object.keys(crudo).forEach(k => { m[norm(k)] = norm(crudo[k]); });
    return m;
  })();

  /** Nombre canónico del cliente: resuelve las diferencias de escritura. */
  const cliente = s => { const n = norm(s); return ALIAS[n] || n; };

  /* ─────────────────────────────────────────────────────────────────────
     NOMBRES DE LOCALIDAD

     El monitor escribe la localidad con su código delante: «0901_GUAYAQUIL»,
     «1701_QUITO». La hoja de tarifas escribe solo el nombre. Sin quitar ese
     prefijo, un exclusivo con origen Guayaquil no encontraba su fila y caía
     en tarifa provisional.
     ───────────────────────────────────────────────────────────────────── */
  const localidad = v => norm(String(v == null ? '' : v).replace(/^\s*\d+\s*[_\-]\s*/, ''));

  /* Un destino de la hoja puede cubrir varios nombres: «Quito y valles»
     incluye Quito. Se parte por los conectores y se compara cada pedazo
     entero, nunca por «contiene»: «Periférico GYE» no es Guayaquil, y
     tratarlo como tal cobraría 49,20 donde van 36,90. */
  function pedazosDestino(t) {
    return String(t == null ? '' : t)
      .split(/\s+Y\s+|[\/,;"()]|\s+-\s+/i)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function coincideDestino(destinoHoja, candidato) {
    const c = localidad(candidato);
    if (!c) return false;
    if (localidad(destinoHoja) === c) return true;
    return pedazosDestino(destinoHoja).some(p => localidad(p) === c);
  }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    if (v instanceof Date) return 0;                 // celdas corrompidas con fecha
    let s = String(v).replace(/[$\s]/g, '').trim();
    if (s === '' || s === '-') return 0;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  /** Busca un valor probando varios nombres de columna, ignorando tildes y espacios. */
  function col(fila, nombres) {
    if (!fila) return '';
    for (const n of nombres) {
      const k = norm(n);
      for (const key in fila) {
        if (norm(key) === k) {
          const v = fila[key];
          if (v !== undefined && v !== null && texto(v) !== '') return v;
        }
      }
    }
    return '';
  }

  /** Primer valor cuya columna empieza por el prefijo dado, ya normalizado. */
  function porPrefijo(fila, prefijo) {
    if (!fila) return '';
    for (const key in fila) {
      if (norm(key).startsWith(prefijo)) {
        const v = fila[key];
        if (v !== undefined && v !== null && texto(v) !== '') return v;
      }
    }
    return '';
  }

  /** Convierte «CAMION FURGON 3.5 TON» en 3.5 · «CONTENEDOR 40» en 40. */
  function toneladasDe(tipoVehiculo) {
    const t = texto(tipoVehiculo).toUpperCase();
    if (!t) return null;
    if (/CONT|CONTENEDOR|40\s*FT|20\s*FT/.test(t)) {
      const ft = t.match(/(\d{2})\s*FT/);
      return ft ? Number(ft[1]) : 40;
    }
    /* El tonelaje se escribe de todas las formas posibles según la hoja:
       «3.5 TON», «3,5 T», «10T», «5 TN», «10 TONELADAS». Se aceptan todas.
       El (?![A-Z]) evita que una palabra que empiece por T —«2 TURNOS»— se
       lea como tonelaje. */
    const TON = 'T(?:ON(?:ELADAS?)?|N)?(?![A-Z])';
    // «10-12 TON» toma el mayor; «3,5 TON U» toma 3.5
    const rango = t.match(new RegExp('(\\d+(?:[.,]\\d+)?)\\s*[-aA]\\s*(\\d+(?:[.,]\\d+)?)\\s*' + TON));
    if (rango) return Number(rango[2].replace(',', '.'));
    const uno = t.match(new RegExp('(\\d+(?:[.,]\\d+)?)\\s*' + TON));
    if (uno) return Number(uno[1].replace(',', '.'));
    if (/MOTO/.test(t)) return 0.5;                  // la moto entra por la columna más baja
    return null;
  }

  /* ─────────────────────────────────────────────────────────────────────
     COSTO POR TIPO DE VEHÍCULO

     Respaldo para cuando la placa no está en la hoja «Tarifario». El tipo
     llega escrito de formas distintas según de dónde venga el dato
     («CAMION FURGON 3.5 TON» en el monitor, «CAMION 3,5 T» en la hoja,
     «FURGONETA 1TON» en la programación), así que no se compara texto: se
     reconoce por palabra o se saca el tonelaje y se busca su tramo.

     Devuelve { costo, tramo } o null si el tipo no se reconoce. Null es
     una respuesta legítima: mejor decir «no sé» y que la pantalla lo
     marque, que devolver un número inventado que nadie va a cuestionar.
     ───────────────────────────────────────────────────────────────────── */
  function costoPorTipo(tipo) {
    const tabla = (global.CONFIG && global.CONFIG.TIPOS_VEHICULO) || [];
    const t = norm(tipo);
    if (!t || !tabla.length) return null;

    // 1. Por palabra: moto, furgoneta, montacargas, plataforma…
    for (const fila of tabla) {
      if (!fila.palabras) continue;
      if (fila.palabras.some(p => t.includes(norm(p)))) {
        return { costo: num(fila.costo), tramo: fila.tipo };
      }
    }

    // 2. Por tonelaje, al tramo que lo cubra. Entre dos tramos, sube.
    const ton = toneladasDe(tipo);
    if (ton == null) return null;
    const escalones = tabla.filter(f => num(f.hasta) > 0)
                           .sort((a, b) => num(a.hasta) - num(b.hasta));
    const tramo = escalones.find(f => ton <= num(f.hasta)) || escalones[escalones.length - 1];
    return tramo ? { costo: num(tramo.costo), tramo: tramo.tipo } : null;
  }

  /** Lee los encabezados de tonelaje de Tarifa Exclusivos y los ordena. */
  function columnasTonelaje(filaEjemplo) {
    const salida = [];
    for (const k of Object.keys(filaEjemplo || {})) {
      const s = texto(k).toUpperCase();
      if (/CONT\s*40|40\s*FT/.test(s)) { salida.push({ clave: k, ton: 40 }); continue; }
      if (/CONT\s*20|20\s*FT/.test(s)) { salida.push({ clave: k, ton: 20 }); continue; }
      const m = s.match(/^(\d+(?:[.,]\d+)?)\s*TON/);
      if (m) salida.push({ clave: k, ton: Number(m[1].replace(',', '.')) });
    }
    return salida.sort((a, b) => a.ton - b.ton);
  }

  // ======================================================================
  //  ESTADO
  // ======================================================================
  const T = {
    peso: [], bulto: [], pedido: [], rango: [], medida: [], exclusivos: [], visitas: [],
    trayectoPorParroquia: {},   // PARROQUIA -> TIPO DE TRAYECTO
    tipoPorPlaca: {},           // PLACA -> TIPO DE VEHÍCULO
    colsTon: [],
    cargado: false
  };

  /** Recibe las tablas crudas tal como las devuelve getAllTarifas. */
  function cargar(t) {
    t = t || {};
    T.peso       = t.peso       || [];
    T.bulto      = t.bulto      || [];
    T.pedido     = t.pedido     || [];
    T.rango      = t.rango      || [];
    T.medida     = t.medida     || [];
    T.exclusivos = t.tarifaExclusivos || [];
    T.visitas    = t.visitas    || [];

    T.trayectoPorParroquia = {};
    (t.trayecto || []).forEach(f => {
      const p = norm(col(f, ['Parroquia', 'PARROQUIA', 'CP', 'Localidad']));
      const tipo = texto(col(f, ['TIPO DE TRAYECTO', 'TIPO_TRAYECTO', 'TRAYECTO'])).toUpperCase();
      if (p && tipo) T.trayectoPorParroquia[p] = tipo;
    });

    /* Hoja «Tarifario»: la flota, con su costo por día. Antes de esto el
       Simulador proponía siempre $130 para cualquier vehículo, así que una
       moto —que cuesta $55— inflaba el costo de la carta porte en $75 y se
       comía la utilidad. El precio de cada placa está en la hoja; se usa. */
    T.tipoPorPlaca = {};
    T.vehiculoPorPlaca = {};
    (t.tarifas || []).forEach(f => {
      const placa = norm(col(f, ['PLACA', 'PLACAS', 'Placa']));
      if (!placa) return;
      const tipo = texto(col(f, ['TIPO VEHICULO', 'TIPO_VEHICULO', 'Tipo Vehiculo', 'TIPO']));
      if (tipo) T.tipoPorPlaca[placa] = tipo;
      T.vehiculoPorPlaca[placa] = {
        tipo,
        /* El encabezado viene recortado de distintas formas según quién
           guardó la hoja («Precio Base Diario», «Precio Base Dia»…), así
           que además de los nombres exactos se acepta cualquiera que
           empiece por «PRECIO BASE». */
        base:      num(col(f, ['Precio Base Diario', 'PRECIO BASE DIARIO', 'PRECIO BASE',
                               'COSTO DIARIO', 'COSTO'])) || num(porPrefijo(f, 'PRECIOBASE')),
        exclusivo: num(col(f, ['EXCLUSIVO HORARIO LABORAL', 'EXCLUSIVO HORARIO'])),
        exclusivoFuera: num(col(f, ['EXCLUSIVO FUERA HORARIO', 'EXCLUSIVO FUERA DE HORARIO'])),
        estiba:    num(col(f, ['ESTIBAS', 'ESTIBA'])),
        horaExtra: num(col(f, ['HORAS EXTRAS', 'HORAS EXTRA', 'HORA EXTRA'])),
        proveedor: texto(col(f, ['PROVEEDOR', 'TRANSPORTISTA']))
      };
    });

    T.colsTon = T.exclusivos.length ? columnasTonelaje(T.exclusivos[0]) : [];
    T.problemas = revisarEstructura();
    T.cargado = true;
    return T;
  }

  /* ─────────────────────────────────────────────────────────────────────
     REVISIÓN DE ESTRUCTURA

     Una hoja puede llegar con las columnas corridas o con una columna de
     menos —al importar, al copiar y pegar, al reordenar—. El motor no tiene
     forma de saberlo: lee el nombre que encuentra y cobra con lo que haya.
     Eso ya pasó: Tfa_Peso llegó sin ARRANQUE y todo HYCITE se facturó al
     precio del kilo adicional ($0,40) en vez de su arranque ($2,83). Nadie
     se dio cuenta porque el número salía en negro, como cualquier tarifa
     buena.

     Así que antes de cobrar nada se revisa que las columnas que la fórmula
     necesita existan de verdad. Lo que falte se reporta en pantalla.
     ───────────────────────────────────────────────────────────────────── */
  const ESTRUCTURA = [
    { tabla: 'peso',       hoja: 'Tfa_Peso',           obliga: ['ARRANQUE', 'TARIFA'] },
    { tabla: 'bulto',      hoja: 'Tfa_Bulto',          obliga: ['TARIFA'] },
    { tabla: 'pedido',     hoja: 'Tfa_Pedido',         obliga: ['TARIFA'] },
    { tabla: 'visitas',    hoja: 'Tfa_Visitas',        obliga: ['CADA'] },
    { tabla: 'exclusivos', hoja: 'Tarifa Exclusivos',  obliga: ['CLIENTE', 'ORIGEN', 'DESTINO'] }
  ];

  function revisarEstructura() {
    const fallos = [];
    ESTRUCTURA.forEach(({ tabla, hoja, obliga }) => {
      const filas = T[tabla];
      if (!filas || !filas.length) return;          // tabla vacía: no es un fallo de estructura
      const claves = new Set(Object.keys(filas[0]).map(norm));
      const faltan = obliga.filter(c => !claves.has(norm(c)));
      if (faltan.length) {
        fallos.push(`La hoja «${hoja}» no trae ${faltan.length === 1 ? 'la columna' : 'las columnas'} ` +
                    faltan.map(c => `«${c}»`).join(' y ') +
                    '. Las tarifas de esa tabla van a salir mal.');
      }
    });
    return fallos;
  }

  const listo = () => T.cargado;

  /** Tipo de vehículo a partir de la placa (hoja Tarifario). */
  const tipoDePlaca = placa => T.tipoPorPlaca[norm(placa)] || '';

  /** Trayecto de una parroquia (hoja Trayecto). */
  const trayectoDe = parroquia => T.trayectoPorParroquia[norm(parroquia)] || '';

  // ======================================================================
  //  BLOQUES DE CÁLCULO
  // ======================================================================

  /**
   * Exclusivos: se elige la columna del tonelaje del vehículo real.
   * Si esa celda está vacía se usa la más cercana disponible y se avisa,
   * porque cobrar de menos en silencio fue justamente el problema anterior.
   */
  /* La fila de Tarifa Exclusivos que corresponde a este pedido: mismo cliente,
     mismo origen y el destino que coincida. Se separó de porExclusivo porque
     la necesitan dos cosas: cobrar un exclusivo y poner el TOPE a un cobro
     normal (ver topeExclusivo). `avisos` puede venir null para buscar sin
     ensuciar la pantalla. */
  function filaExclusivoDe(p, avisos) {
    if (!T.exclusivos.length) return null;

    const cli    = cliente(p.cliente);
    const origen = localidad(p.origen);
    // En Tarifa Exclusivos el destino son ciudades, no parroquias
    const candidatos = [p.ciudad, p.destino].filter(Boolean);

    /* Un origen escrito «CUALQUIERA» en la hoja vale para todos: así lo tienen
       CARESTINO y ZTECORP, cuyo tarifario no abre por origen. */
    const mismoOrigen = f => {
      const o = localidad(col(f, ['ORIGEN']));
      return o === origen || o === 'CUALQUIERA';
    };
    const delCliente = T.exclusivos.filter(f =>
      cliente(col(f, ['CLIENTE'])) === cli && mismoOrigen(f));
    if (!delCliente.length) return null;

    // Primero el nombre exacto; solo si no hay, el que lo contiene como pedazo
    for (const dest of candidatos) {
      const f = delCliente.find(x => localidad(col(x, ['DESTINO'])) === localidad(dest));
      if (f) return f;
    }
    for (const dest of candidatos) {
      const f = delCliente.find(x => coincideDestino(col(x, ['DESTINO']), dest));
      if (f) {
        if (avisos) avisos.push(`Destino «${texto(dest)}» resuelto con la fila «${texto(col(f, ['DESTINO']))}».`);
        return f;
      }
    }
    return null;
  }

  /* ─────────────────────────────────────────────────────────────────────
     TOPE DE EXCLUSIVO

     Ningún cobro normal puede salir más caro que alquilarle al cliente el
     vehículo entero. Si la tarifa por peso, bulto o rango pasa del precio
     de exclusivo MÁS BARATO de esa ruta, se cobra ese precio.

     Es aritmética de sentido común: un SG de 1.500 kg por kilo se dispara,
     cuando por ese dinero el cliente contrata el camión. Antes el sistema
     cobraba el número alto y nadie lo cuestionaba hasta ver la factura.

     Se toma la columna de tonelaje más baja con precio de la fila que
     corresponde a la ruta —no de otra ruta del cliente—, porque un precio
     de Quito local no sirve para un envío a Guayaquil.
     ───────────────────────────────────────────────────────────────────── */
  function topeExclusivo(p) {
    const fila = filaExclusivoDe(p, null);
    if (!fila) return null;
    const barata = T.colsTon.find(c => num(fila[c.clave]) > 0);
    if (!barata) return null;
    return {
      total: num(fila[barata.clave]),
      ton: barata.ton,
      destino: texto(col(fila, ['DESTINO']))
    };
  }

  function porExclusivo(p, avisos) {
    if (!T.exclusivos.length) return null;

    const fila = filaExclusivoDe(p, avisos);
    if (!fila) {
      const dest = texto(p.ciudad || p.destino);
      if (T.exclusivos.some(f => cliente(col(f, ['CLIENTE'])) === cliente(p.cliente))) {
        avisos.push(`${texto(p.cliente)} no tiene tarifa de exclusivo para ${texto(p.origen) || '—'} → ${dest || '—'}.`);
      }
      return null;
    }

    /* ─────────────────────────────────────────────────────────────
       EXCLUSIVO CONSOLIDADO

       Un pedido marcado EXCLUSIVO que viaja en una carta porte con muchos
       pedidos normales no ocupó el vehículo: fue consolidado con el resto.
       Cobrarle el camión entero sería cobrar dos veces el mismo viaje —el
       camión ya lo pagan los demás pedidos—. En ese caso se cobra la
       columna de tonelaje más baja que tenga la ruta, que es lo más
       parecido a «una entrega dedicada dentro de un reparto».

       El umbral está en config.js (EXCLUSIVO_CONSOLIDADO_DESDE). */
    const normales = num(p.normalesEnCP);
    const umbralCons = num(global.CONFIG && global.CONFIG.EXCLUSIVO_CONSOLIDADO_DESDE) || 5;
    const consolidado = normales > umbralCons;

    const ton = consolidado ? null : toneladasDe(p.tipoVehiculo);
    if (!consolidado && ton == null) {
      avisos.push('No se pudo identificar el tonelaje del vehículo; se usó la tarifa más baja.');
    }

    // Columna exacta, o la más cercana con valor
    let elegida = null;
    if (ton != null) {
      elegida = T.colsTon.find(c => Math.abs(c.ton - ton) < 0.01 && num(fila[c.clave]) > 0);
      if (!elegida) {
        const abajo = T.colsTon.filter(c => c.ton <= ton && num(fila[c.clave]) > 0).pop();
        const arriba = T.colsTon.find(c => c.ton > ton && num(fila[c.clave]) > 0);
        elegida = abajo || arriba || null;
        if (elegida) {
          avisos.push(`Sin tarifa para ${ton} TON en esta ruta; se aplicó la de ${elegida.ton} TON.`);
        }
      }
    }
    if (!elegida) elegida = T.colsTon.find(c => num(fila[c.clave]) > 0) || null;
    if (consolidado && elegida) {
      avisos.push(`Va consolidado con ${normales} pedidos normales en la misma carta porte, ` +
                  `así que no ocupó el vehículo: se cobra la tarifa de ${elegida.ton} TON, ` +
                  `la más baja de esta ruta.`);
    }
    if (!elegida) return null;

    const monto = num(fila[elegida.clave]);
    if (monto <= 0) return null;

    return {
      total: monto,
      origen: 'Tarifa Exclusivos',
      detalle: `${texto(col(fila, ['ORIGEN']))} → ${texto(col(fila, ['DESTINO']))} · ${elegida.clave}`,
      estibaSugerida: num(col(fila, ['ESTIBAS'])) || 0,
      tonUsado: elegida.ton
    };
  }

  /** Tfa_Medida: reglas especiales por cliente y trayecto. */
  function porMedida(p, avisos) {
    if (!T.medida.length) return null;
    const cli = cliente(p.cliente);
    const reglas = T.medida.filter(r => cliente(col(r, ['Cliente (AN)', 'Cliente'])) === cli);
    if (!reglas.length) return null;

    const regla = reglas.find(r => norm(col(r, ['Trayecto (AQ)', 'Trayecto'])) === norm(p.trayecto));
    let total = 0, aplico = false, detalle = '';

    if (regla) {
      const precio  = num(col(regla, ['Tarifa (AR)', 'Tarifa']));
      const nota    = texto(col(regla, ['Detalle / Regla (AS)', 'Detalle / Regla'])).toUpperCase();

      if (nota.includes('POR CADA KG') || nota.includes('POR KG')) {
        total = precio * p.peso; detalle = `${precio} × ${p.peso} kg`; aplico = true;
      } else if (nota.includes('CAJA') || nota.includes('BULTO') || nota.includes('ITEM') || nota.includes('ÍTEM')) {
        /* La multiplicación por bultos la hace aplicarUnidad al final, una sola
           vez. Antes se hacía también aquí y el total salía elevado al cuadrado
           cuando la fila además declaraba UNIDAD = BULTO. */
        // El tope de cajas lo resuelve Tfa_Bulto con su columna SI SUPERA
        total = precio * bultosDe(p); detalle = `${precio} × ${bultosDe(p)} bultos`; aplico = true;
      } else {
        total = precio; detalle = nota || 'Tarifa plana'; aplico = true;
      }

      if (precio === 0 && nota.includes('DEFINIR')) {
        avisos.push(`Tarifa pendiente de definir para ${p.cliente} en ${p.trayecto}.`);
      }
    }

    // Recargo de estiba por peso, si el cliente lo tiene configurado
    const rEstiba = reglas.find(r => norm(col(r, ['Trayecto (AQ)', 'Trayecto'])) === 'ESTIBAS');
    if (rEstiba) {
      const nota = texto(col(rEstiba, ['Detalle / Regla (AS)', 'Detalle / Regla'])).toUpperCase();
      const lim  = (nota.match(/(\d+)\s*KG/) || [])[1];
      if (lim && p.peso > Number(lim)) {
        total += num(col(rEstiba, ['Tarifa (AR)', 'Tarifa']));
        detalle += ` + estiba (>${lim} kg)`;
        aplico = true;
      }
    }

    return aplico ? { total, origen: 'Tfa_Medida', detalle } : null;
  }

  /* Un TRAYECTO escrito «TODOS» en la hoja vale para cualquiera. Hace falta
     porque varios contratos no abren precio por trayecto —Telefónica lo dice
     con todas sus letras— y antes había que repetir la misma tarifa diez veces,
     una por trayecto, con el riesgo de que alguna quedara distinta. */
  function mismoTrayecto(valorHoja, trayectoPedido) {
    const v = norm(valorHoja);
    return v === 'TODOS' || v === norm(trayectoPedido);
  }

  /* ─────────────────────────────────────────────────────────────────────
     DOS TABLAS, DOS MANERAS DE COBRAR

     Tfa_Peso  — el precio lo manda el PESO y se cobra una vez por envío.
     Tfa_Bulto — el precio lo manda la CANTIDAD DE BULTOS.

     Están separadas a propósito: quien abre la hoja ve de una qué clientes
     cobran de qué manera, sin tener que leer una columna. Dentro de
     Tfa_Bulto hay tres formas, según qué columnas tenga llenas la fila:

       BULTO ADICIONAL      el primer bulto va a TARIFA y cada uno de los
                            siguientes a este precio. PEARSON: «bulto exta».
       BULTOS POR GRUPO     agrupa de N en N y cobra TARIFA por grupo o
                            fracción. ZIPPAK: un pallet son 24 cajas.
       (ninguna de las dos) TARIFA × cantidad de bultos. SG, MULTIVAC,
                            SHNEIDER, VENTURA, IBM, INV KYND.
     ───────────────────────────────────────────────────────────────────── */
  function bultosDe(p) {
    return Math.max(1, Math.round(num(p.bultos)) || 1);
  }

  /** Precio de una fila para un solo bulto: arranque + kilo excedente. */
  function precioUnitario(fila, pesoDelBulto) {
    const arranque = num(col(fila, ['ARRANQUE', 'ARRANQUE KG']));
    const base     = num(col(fila, ['TARIFA']));
    const adic     = num(col(fila, ['KG ADICIONAL']));
    if (!adic || pesoDelBulto <= arranque) return { total: base, detalle: arranque ? `Hasta ${arranque} kg` : `${base}` };
    const exceso = pesoDelBulto - arranque;
    return { total: base + exceso * adic, detalle: `${base} + ${exceso.toFixed(1)} kg × ${adic}` };
  }

  /** Tfa_Bulto: el precio lo manda la cantidad de bultos. */
  function porBultos(p) {
    if (!T.bulto.length) return null;
    const fila = T.bulto.find(r =>
      cliente(col(r, ['Cliente', 'CLIENTE'])) === cliente(p.cliente) &&
      mismoTrayecto(col(r, ['TRAYECTO']), p.trayecto));
    if (!fila) return null;

    const servicio = texto(col(fila, ['SERVICIO'])).toUpperCase();
    if (servicio.includes('NO PAGAN')) {
      return { total: 0, origen: 'Tfa_Bulto', detalle: 'Trayecto sin cargo', sinCargo: true };
    }

    const n      = bultosDe(p);

    /* Tope de la fila. SPARE lo dice así: «por caja, máximo 9; a la 10ma se
       cobra TRUCK 1». La columna SI SUPERA nombra el trayecto al que se salta,
       y su tarifa se busca en esta misma tabla o en Tfa_Medida. */
    const maxB = num(col(fila, ['MAX BULTOS']));
    const sup  = texto(col(fila, ['SI SUPERA'])).toUpperCase();
    if (maxB > 0 && n > maxB && sup && sup !== 'EXCLUSIVO') {
      const destino = T.bulto.concat(T.medida).find(r =>
        cliente(col(r, ['Cliente', 'CLIENTE', 'Cliente (AN)'])) === cliente(p.cliente) &&
        norm(col(r, ['TRAYECTO', 'Trayecto (AQ)', 'Trayecto'])) === norm(sup));
      if (destino) {
        return { total: num(col(destino, ['TARIFA', 'Tarifa (AR)', 'Tarifa'])), origen: 'Tfa_Bulto',
                 detalle: `Supera ${maxB} bultos → ${sup}` };
      }
    }

    const grupo  = num(col(fila, ['BULTOS POR GRUPO', 'AGRUPA']));
    const extra  = num(col(fila, ['BULTO ADICIONAL']));
    const base   = num(col(fila, ['TARIFA']));

    if (grupo > 0) {
      const grupos = Math.ceil(n / grupo);
      return { total: base * grupos, origen: 'Tfa_Bulto',
               detalle: `${grupos} × ${base} (${n} bultos, ${grupo} por grupo)` };
    }

    if (extra > 0) {
      // El peso del primer bulto decide su arranque; los demás van a precio fijo
      const primero = precioUnitario(fila, num(p.peso) / n);
      return { total: primero.total + (n - 1) * extra, origen: 'Tfa_Bulto',
               detalle: n === 1 ? primero.detalle
                                : `${primero.detalle} + ${n - 1} bulto${n === 2 ? '' : 's'} × ${extra}` };
    }

    // El peso se reparte entre los bultos para decidir el arranque de cada uno
    const u = precioUnitario(fila, num(p.peso) / n);
    return { total: u.total * n, origen: 'Tfa_Bulto',
             detalle: n === 1 ? u.detalle : `(${u.detalle}) × ${n} bultos` };
  }

  /* ─────────────────────────────────────────────────────────────────────
     VISITAS FALLIDAS

     Hay clientes con reintentos incluidos. HYCITE lo dice así en su
     relevamiento: «tienen 3 visitas = 1 trayecto; 4, 5 y 6 visita = 2
     trayecto», y más abajo «cada 3 visitas se cobra un trayecto». O sea que
     la primera visita se cobra y las dos siguientes no; a la cuarta empieza
     un segundo cobro.

     Dos reglas, según lo que diga la hoja:
       OTRO TRAYECTO   se cobra la tarifa completa una vez por cada N visitas.
       TARIFA FIJA     se suma un monto fijo por cada tanda extra. TUENTI, cuya
                       devolución tras 3 intentos cuesta 0,1938 por unidad.

     Las visitas salen de QTY_INCIDENCIAS + 1: una incidencia es una entrega
     que no se pudo hacer, así que tres incidencias son cuatro visitas. Es
     exactamente como lo cuenta HYCITE («se cuentan las 3 incidencias, se
     tienen que cobrar 2 pedidos porque salieron»).
     ───────────────────────────────────────────────────────────────────── */
  function porVisitas(p, r, avisos) {
    if (!r || !T.visitas.length) return r;

    const fila = T.visitas.find(f =>
      cliente(col(f, ['Cliente', 'CLIENTE'])) === cliente(p.cliente));
    if (!fila) return r;

    const cada = num(col(fila, ['VISITAS POR COBRO', 'VISITAS INCLUIDAS', 'VISITAS']));
    if (cada <= 0) return r;

    const visitas = Math.max(1, Math.round(num(p.visitas)) || 1);
    const cobros  = Math.ceil(visitas / cada);
    if (cobros <= 1) return r;

    const regla = texto(col(fila, ['REGLA'])).toUpperCase();

    if (regla.indexOf('FIJA') >= 0) {
      const extra = num(col(fila, ['TARIFA']));
      if (extra <= 0) {
        avisos.push(`${visitas} visitas, pero la tarifa de reintento no está definida en Tfa_Visitas.`);
        return r;
      }
      avisos.push(`${visitas} visitas: se suman ${cobros - 1} reintento${cobros === 2 ? '' : 's'} a ${extra}.`);
      return Object.assign({}, r, {
        total: r.total + (cobros - 1) * extra,
        detalle: `${r.detalle} + ${cobros - 1} × ${extra} por reintento`
      });
    }

    avisos.push(`${visitas} visitas: se cobran ${cobros} trayectos, uno por cada ${cada}.`);
    return Object.assign({}, r, {
      total: r.total * cobros,
      detalle: `(${r.detalle}) × ${cobros} trayectos por ${visitas} visitas`,
      cobrosPorVisitas: cobros
    });
  }

  /** Tope del modelo courier: pasado eso, el pedido deja de ser courier.
      TEKMAN lo dice así: «máximo 10 bultos y 100 kg; a la 11va caja debe ser
      exclusivo». Sin esto se seguía cobrando tarifa de paquete a un camión. */
  function superaElTope(p) {
    const fila = T.peso.concat(T.bulto).find(r =>
      cliente(col(r, ['Cliente', 'CLIENTE'])) === cliente(p.cliente));
    if (!fila) return null;
    const sup  = texto(col(fila, ['SI SUPERA'])).toUpperCase();
    if (sup && sup !== 'EXCLUSIVO') return null;   // el salto lo resuelve la propia tabla
    const maxB = num(col(fila, ['MAX BULTOS', 'MAXBULTOS']));
    const maxK = num(col(fila, ['MAX KG', 'MAXKG']));
    const n = bultosDe(p);
    if (maxB > 0 && n > maxB)           return `Supera los ${maxB} bultos del modelo courier: se cobra como exclusivo.`;
    if (maxK > 0 && num(p.peso) > maxK) return `Supera los ${maxK} kg del modelo courier: se cobra como exclusivo.`;
    return null;
  }

  /** Tfa_Peso: arranque + tarifa + kilo adicional. */
  function porPeso(p, avisos) {
    if (!T.peso.length) return null;
    const fila = T.peso.find(r =>
      cliente(col(r, ['Cliente'])) === cliente(p.cliente) &&
      mismoTrayecto(col(r, ['TRAYECTO']), p.trayecto));
    if (!fila) return null;

    // Una fila marcada «No pagan» no se cobra. El motor anterior ignoraba
    // esta columna y facturaba igual.
    const servicio = texto(col(fila, ['SERVICIO'])).toUpperCase();
    if (servicio.includes('NO PAGAN')) {
      return { total: 0, origen: 'Tfa_Peso', detalle: 'Trayecto sin cargo', sinCargo: true };
    }

    const arranque = num(col(fila, ['ARRANQUE']));
    const base     = num(col(fila, ['TARIFA']));
    const adic     = num(col(fila, ['KG ADICIONAL']));

    /* Sin arranque no hay cómo cobrar esta tabla: el arranque es el peso que
       ya viene incluido en la tarifa. Si llega vacío, o si la tarifa es más
       barata que el propio kilo adicional (imposible: el arranque cubre
       varios kilos), la fila está mal leída —columnas corridas al importar—
       y lo que se cobre va a ser una fracción de lo que toca. Se cobra
       igual para no dejar la carta porte en cero, pero se avisa y el pedido
       queda marcado para revisar. */
    const sospecha = !arranque ? 'no trae ARRANQUE'
                   : !adic ? 'tiene arranque pero no tiene kilo adicional, así que el peso no cambia nada'
                   : (base < adic) ? 'tiene la tarifa más barata que el kilo adicional'
                   : '';
    if (sospecha && avisos) {
      avisos.push(`La fila de ${texto(col(fila, ['Cliente']))} en ${texto(col(fila, ['TRAYECTO']))} ` +
                  `${sospecha}: revisa las columnas de Tfa_Peso en el Drive. ` +
                  `El cobro de este pedido no es de fiar.`);
    }

    const salida = r => (sospecha ? { ...r, dudosa: true } : r);

    if (p.peso <= arranque) return salida({ total: base, origen: 'Tfa_Peso', detalle: `Hasta ${arranque} kg` });
    const exceso = p.peso - arranque;
    return salida({
      total: base + exceso * adic,
      origen: 'Tfa_Peso',
      detalle: `${base} + ${exceso.toFixed(1)} kg × ${adic}`
    });
  }

  /** Tfa_Pedido: tarifa fija. */
  function porPedido(p) {
    if (!T.pedido.length) return null;

    /* El servicio se busca primero tal como viene del monitor (CONECEL factura
       distinto una SIMCARD que una laptop) y, si no hay fila para eso, por el
       servicio base. Así conviven las tarifas por tipo de producto con las de
       siempre sin duplicar la tabla. */
    const busca = servicioBuscado => T.pedido.find(r =>
      cliente(col(r, ['Cliente'])) === cliente(p.cliente) &&
      norm(col(r, ['SERVICIO'])) === norm(servicioBuscado) &&
      mismoTrayecto(col(r, ['TRAYECTO']), p.trayecto));

    const fila = busca(p.servicio) || busca(p.servicioBase);
    if (!fila) return null;
    return { total: num(col(fila, ['TARIFA'])), origen: 'Tfa_Pedido', detalle: 'Tarifa fija' };
  }

  /** Tfa_Rango: por tramo de peso. */
  function porRango(p) {
    if (!T.rango.length) return null;
    const fila = T.rango.find(r =>
      cliente(col(r, ['CLIENTE'])) === cliente(p.cliente) &&
      mismoTrayecto(col(r, ['TRAYECTO']), p.trayecto));
    if (!fila) return null;

    const tramos = [5, 10, 15, 20, 30, 50, 70, 100, 150];
    const tramo = tramos.find(t => p.peso <= t) || 150;
    const clave = `(hasta ${tramo} kg)`;
    let monto = num(col(fila, [clave]));

    // Sobre el último tramo se prorratea: la tabla no llega más arriba
    if (p.peso > 150) {
      const tope = num(col(fila, ['(hasta 150 kg)']));
      if (tope > 0) {
        return {
          total: (p.peso * tope) / 150,
          origen: 'Tfa_Rango',
          detalle: `Prorrateo sobre 150 kg (${p.peso} kg)`
        };
      }
    }
    if (monto <= 0) return null;
    return { total: monto, origen: 'Tfa_Rango', detalle: clave };
  }

  /* ZIPPAK ya no tiene regla escrita en el código: su cobro por pallet vive
     en Tfa_Medida, como el de cualquier otro cliente. Lo que sigue existe solo
     por si la hoja se quedara sin esa fila, y avisa cuando entra. */
  function porZippakDeRespaldo(p, avisos) {
    const r = (global.CONFIG && global.CONFIG.REGLA_ZIPPAK) || {};
    const kg     = num(r.KG_POR_BLOQUE);
    const precio = num(r.PRECIO_BLOQUE);
    if (!kg || !precio) return null;
    avisos.push('ZIPPAK no tiene fila en Tfa_Medida: se usó la regla de respaldo de config.js.');
    const bloques = Math.max(1, Math.ceil(p.peso / kg));
    return {
      total: bloques * precio,
      origen: 'ZIPPAK (respaldo)',
      detalle: `${bloques} bloque${bloques === 1 ? '' : 's'} de ${kg} kg × $${precio.toFixed(2)}`
    };
  }

  // ======================================================================
  //  CÁLCULO
  // ======================================================================
  /**
   * @param {object} pedido  cliente, servicio, ciudad, destino (parroquia),
   *                         origen, peso, bultos, placa, tipoVehiculo
   * @returns {{total:number, origen:string, detalle:string, avisos:string[],
   *            sinTarifa:boolean, trayecto:string, estibaSugerida:number}}
   */
  function calcular(pedido) {
    const avisos = [];

    const cli      = texto(pedido.cliente).toUpperCase();
    const peso     = Math.max(0, num(pedido.peso));
    const bultos   = Math.max(1, num(pedido.bultos) || 1);
    const servicio = texto(pedido.servicio).toUpperCase();

    /* Movimientos internos. No son venta: es carga que la propia operación
       mueve entre sus bodegas, así que no factura nada y no cuenta como
       pedido «sin tarifa». La lista vive en config.js (CLIENTES_INTERNOS)
       para poder sumar o quitar uno sin tocar el motor. */
    const internos = (global.CONFIG && global.CONFIG.CLIENTES_INTERNOS) || [];
    if (internos.some(x => cliente(x) === cliente(cli))) {
      return {
        total: 0, origen: 'Movimiento interno',
        detalle: 'Movimiento interno: no se factura',
        avisos, sinTarifa: false, provisional: false, sinCargo: true,
        trayecto: texto(pedido.trayecto).toUpperCase() || trayectoDe(pedido.destino),
        tipoVehiculo: texto(pedido.tipoVehiculo) || tipoDePlaca(pedido.placa),
        visitas: 1, cobrosPorVisitas: 1, estibaSugerida: 0
      };
    }

    /* ─────────────────────────────────────────────────────────────────
       RECOBRO

       Un pedido que no se pudo entregar vuelve a salir al día siguiente en
       otra carta porte. El flete ya se cobró la primera vez; cobrarlo otra
       vez es facturar dos veces el mismo envío. Así que un pedido que el
       sistema ya tiene registrado va en cero, con la referencia de dónde
       se cobró.

       El límite son los intentos incluidos (3 por defecto, en config.js).
       A partir del cuarto ya no es un reintento cubierto: es un viaje
       más que alguien paga, y se vuelve a cobrar la tarifa completa.
       ───────────────────────────────────────────────────────────────── */
    const intentos = Math.max(1, Math.round(num(pedido.visitas || pedido.intentos)) || 1);
    const incluidos = num(global.CONFIG && global.CONFIG.INTENTOS_INCLUIDOS) || 3;
    const previo = pedido.yaCobrado;

    /* Cada cobro cubre «incluidos» intentos: el 1º cobra y trae gratis el 2º
       y el 3º; el 4º vuelve a cobrar y trae gratis el 5º y el 6º; y así.

       No se mira «¿el intento pasa de 3?» sino «¿cuántos cobros DEBERÍA
       llevar ya este pedido, y cuántos lleva?». Es lo mismo en el caso
       normal, pero aguanta que el conteo de intentos llegue desordenado o
       con saltos, que es lo que pasa cuando una novedad no se registra. */
    const cobrosPrevios = previo ? Math.max(1, Math.round(num(previo.cobros)) || 1) : 0;
    const cobrosQueTocan = Math.ceil(intentos / incluidos);
    const tocaCobrar = cobrosQueTocan > cobrosPrevios;

    if (previo && !tocaCobrar) {
      const donde = previo.cartaPorte ? `la carta porte ${previo.cartaPorte}` : 'una carta porte anterior';
      const cuando = previo.fecha ? ` del ${previo.fecha}` : '';
      return {
        total: 0,
        origen: 'Ya cobrado',
        detalle: `Cobrado en ${donde}${cuando}`,
        avisos,
        sinTarifa: false, provisional: false, sinCargo: true,
        yaCobrado: true, cobradoEn: previo,
        motivo: `Este pedido ya se facturó en ${donde}${cuando}` +
                (previo.tarifa > 0 ? ` por $${previo.tarifa.toFixed(2)}` : '') +
                `. Va por el intento ${intentos} y ese cobro cubre ${incluidos}, ` +
                `así que no se vuelve a cobrar.`,
        trayecto: texto(pedido.trayecto).toUpperCase() || trayectoDe(pedido.destino),
        tipoVehiculo: texto(pedido.tipoVehiculo) || tipoDePlaca(pedido.placa),
        visitas: intentos, cobrosPorVisitas: 0, estibaSugerida: 0
      };
    }
    /* Al recobrar se cobra UN viaje, no todos.

       Hay clientes con regla propia de visitas (HYCITE cobra un trayecto por
       cada 3 intentos). Si al cuarto intento se aplicaran las dos cosas
       —recobro y multiplicador de visitas— se cobrarían 2 trayectos cuando
       el primero ya se facturó en la carta porte anterior. Así que en un
       recobro el contador de visitas se pone a 1: los intentos anteriores
       ya están pagados. */
    const recobra = !!(previo && tocaCobrar);
    if (recobra) {
      avisos.push(`Intento ${intentos}: los ${cobrosPrevios} cobro${cobrosPrevios === 1 ? '' : 's'} ` +
                  `anterior${cobrosPrevios === 1 ? '' : 'es'} ya cubrieron ${cobrosPrevios * incluidos} intentos, ` +
                  `así que se vuelve a cobrar. ` +
                  `Ya se había facturado en ${previo.cartaPorte ? 'la carta porte ' + previo.cartaPorte : 'una carta porte anterior'}` +
                  `, así que se cobra un viaje, no ${intentos}.`);
    }

    // El trayecto sale de la parroquia. Sin trayecto no hay tarifa posible:
    // antes esto caía a «LOCAL», que no existe en ninguna tabla, y devolvía 0.
    let trayecto = texto(pedido.trayecto).toUpperCase() || trayectoDe(pedido.destino);
    if (!trayecto) {
      avisos.push(`La parroquia «${texto(pedido.destino) || 'sin dato'}» no está en la hoja Trayecto.`);
    }

    // Por encima de cierto peso el pedido ocupa el vehículo entero, así que
    // se cobra como exclusivo aunque el monitor no lo marque. El umbral está
    // en config.js (KG_PARA_EXCLUSIVO). ZIPPAK queda fuera: tiene regla propia.
    const kgExclusivo = num(global.CONFIG && global.CONFIG.KG_PARA_EXCLUSIVO) || 500;
    let servicioBase = (servicio.includes('EXCLUSIVO') || servicio.includes('DEDICADO')) ? 'EXCLUSIVO' : 'NORMAL';
    if (peso > kgExclusivo && cliente(cli) !== 'ZIPPAK' && servicioBase !== 'EXCLUSIVO') {
      servicioBase = 'EXCLUSIVO';
      avisos.push(`Supera ${kgExclusivo} kg: se cobra como exclusivo.`);
    }

    // Tope declarado por el propio cliente en la hoja (TEKMAN: 10 bultos, 100 kg)
    if (servicioBase !== 'EXCLUSIVO') {
      const tope = superaElTope({ cliente: cli, bultos: pedido.bultos, peso });
      if (tope) { servicioBase = 'EXCLUSIVO'; avisos.push(tope); }
    }

    const tipoVehiculo = texto(pedido.tipoVehiculo) || tipoDePlaca(pedido.placa);

    const p = {
      cliente: cli, peso, bultos, servicio, servicioBase, trayecto,
      visitas: recobra ? 1 : intentos,
      ciudad: texto(pedido.ciudad).toUpperCase(),
      destino: texto(pedido.destino).toUpperCase(),
      origen: texto(pedido.origen).toUpperCase(),
      placa: texto(pedido.placa).toUpperCase(),
      // Cuántos pedidos normales comparten su carta porte: lo cuenta API.
      normalesEnCP: num(pedido.normalesEnCP),
      tipoVehiculo
    };

    let r = null;
    if (servicioBase === 'EXCLUSIVO')    r = porExclusivo(p, avisos);
    if (!r)                              r = porBultos(p);
    if (!r)                              r = porMedida(p, avisos);
    if (!r && cliente(cli) === 'ZIPPAK') r = porZippakDeRespaldo(p, avisos);
    if (!r && servicioBase === 'NORMAL') r = porPeso(p, avisos);
    if (!r)                              r = porPedido(p);
    if (!r && servicioBase !== 'EXCLUSIVO') r = porRango(p);

    /* Ninguna tabla aplicó. Antes esto se facturaba en $0 y hundía el margen
       de la carta porte entera con un número que nadie se creía. Ahora entra
       una tarifa provisional —la de config.js— para que el total sea una
       estimación defendible, pero el pedido queda marcado: sale en rojo en su
       carta porte, encabezando la lista, y aparece en «Revisar antes de
       guardar» para corregirlo antes de que se vaya a la base. */
    if (!r) {
      const prov   = (global.CONFIG && global.CONFIG.TARIFA_PROVISIONAL) || {};
      const esExcl = servicioBase === 'EXCLUSIVO';
      const monto  = num(esExcl ? prov.EXCLUSIVO : prov.NORMAL) || (esExcl ? 40 : 3.50);

      return {
        total: monto,
        origen: 'Provisional',
        detalle: `Provisional de ${esExcl ? 'exclusivo' : 'normal'}: $${monto.toFixed(2)}`,
        avisos,
        sinTarifa: true, provisional: true, trayecto, tipoVehiculo,
        motivo: `Sin tarifa configurada para ${cli || 'cliente sin nombre'}` +
                (trayecto ? ` en ${trayecto}` : '') +
                `. Va con la provisional de ${esExcl ? 'exclusivo' : 'normal'} ($${monto.toFixed(2)}).`,
        estibaSugerida: 0
      };
    }

    if (servicioBase === 'EXCLUSIVO' && r.origen !== 'Tarifa Exclusivos' && r.origen !== 'Regla ZIPPAK') {
      avisos.push('Es exclusivo pero no hay fila en Tarifa Exclusivos para esta ruta.');
    }

    /* ───────────────────────────────────────────────────────────────────
       TOPE DE EXCLUSIVO

       Ningún cobro normal puede salir más caro que alquilarle al cliente el
       vehículo entero por esa misma ruta. Si la tarifa por peso, bulto,
       pedido o rango pasa del exclusivo MÁS BARATO de la ruta, se cobra ese
       exclusivo y se avisa.

       Se aplica ANTES de las visitas, porque el tope es por viaje: si el
       cliente tiene regla de visitas, cada viaje topa por separado.
       No se aplica a lo que ya salió de Tarifa Exclusivos (sería toparse a
       sí mismo) ni a los que van sin cargo. Se apaga con
       CONFIG.TOPE_EXCLUSIVO = false.                                      */
    const topeActivo = !(global.CONFIG && global.CONFIG.TOPE_EXCLUSIVO === false);
    if (topeActivo && r.total > 0 && !r.sinCargo && r.origen !== 'Tarifa Exclusivos') {
      const tope = topeExclusivo(p);
      if (tope && tope.total > 0 && r.total > tope.total) {
        const antes = Math.round(r.total * 100) / 100;
        avisos.push(`La tarifa normal daba $${antes.toFixed(2)}, más que el exclusivo más ` +
                    `barato de esta ruta (${tope.ton} TON, $${tope.total.toFixed(2)}). ` +
                    `Se cobra el exclusivo.`);
        r = {
          total: tope.total,
          origen: 'Tope exclusivo',
          detalle: `Tope: exclusivo de ${tope.ton} TON` +
                   (tope.destino ? ` a ${tope.destino}` : '') +
                   ` ($${tope.total.toFixed(2)}) en vez de $${antes.toFixed(2)} por ${r.origen.toLowerCase()}`,
          tonUsado: tope.ton,
          topeExclusivo: true,
          antesDelTope: antes,
          dudosa: !!r.dudosa,
          estibaSugerida: r.estibaSugerida || 0
        };
      }
    }

    // Las visitas fallidas se aplican sobre la tarifa ya resuelta, venga de
    // donde venga: peso, bulto, pedido, rango o exclusivo.
    r = porVisitas(p, r, avisos);

    return {
      total: Math.round(r.total * 100) / 100,
      origen: r.origen,
      detalle: r.detalle || '',
      avisos,
      sinTarifa: false,
      provisional: false,
      sinCargo: !!r.sinCargo,
      dudosa: !!r.dudosa,
      topeExclusivo: !!r.topeExclusivo,
      antesDelTope: r.antesDelTope,
      recobrado: recobra,
      intentos,
      trayecto, tipoVehiculo,
      tonUsado: r.tonUsado,
      visitas: p.visitas,
      cobrosPorVisitas: r.cobrosPorVisitas || 1,
      estibaSugerida: r.estibaSugerida || 0
    };
  }

  global.Tarifas = {
    cargar, listo, calcular,
    trayectoDe, tipoDePlaca, toneladasDe,
    /** Columnas que faltan en las hojas del Drive. Vacío = estructura sana. */
    problemas: () => (T.problemas || []).slice(),
    /** Fila de la hoja «Tarifario» para una placa: costo por día y demás. */
    vehiculoDePlaca: placa => T.vehiculoPorPlaca[norm(placa)] || null,
    /** Costo por día según el tipo, cuando la placa no está en la hoja. */
    costoPorTipo,
    _tablas: T
  };
})(window);
