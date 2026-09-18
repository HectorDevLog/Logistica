/* ==========================================================================
   Sistema de Rentabilidad · Distribución
   © 2026 Héctor Torres. Todos los derechos reservados.
   ========================================================================== */
/* ==========================================================================
   Núcleo de la aplicación
   --------------------------------------------------------------------------
   Todo lo que comparten las páginas vive aquí: sesión, permisos, navegación,
   tema, formato de números y los componentes de interfaz (toast, confirmar,
   pedir un dato). Las páginas solo escriben su propia lógica.

   Uso en cada página:
     <body data-modulo="simcp">
       ...
       <script src="config.js"></script>
       <script src="assets/app.js"></script>

   FX.montar() se llama solo. Si la persona no tiene permiso sobre el módulo
   declarado en data-modulo, la página se bloquea antes de mostrar nada.
   ========================================================================== */
(function (global) {
  'use strict';

  const CFG = global.CONFIG || {};

  // ======================================================================
  // CATÁLOGO DE MÓDULOS
  // Agregar una pantalla al sistema es agregar una entrada aquí: aparece en
  // el menú, en el Inicio y en el editor de permisos, y queda protegida.
  // ======================================================================
  const MODULOS = [
    {
      clave: 'inicio', pagina: 'Inicio.html', nombre: 'Inicio', fijo: true,
      resumen: 'Punto de partida del sistema.',
      descripcion: 'Panel de entrada con los accesos y el pulso del día. Siempre visible.',
      icono: 'home'
    },
    {
      clave: 'simcp', pagina: 'SimuladorCartaPorte.html', nombre: 'Simulador CP',
      resumen: 'Costea cada carta porte antes de cerrarla.',
      descripcion: 'Calcula ingresos, costos y utilidad de cada carta porte.',
      icono: 'file'
    },
    {
      clave: 'proyeccion', pagina: 'ProyeccionGlobal.html', nombre: 'Proyección',
      resumen: 'Arma la flota del día y mira si cierra en verde.',
      descripcion: 'Proyecta la operación antes de que ocurra: flota, pedidos e ingresos.',
      icono: 'target'
    },
    {
      clave: 'dashboard', pagina: 'Reportes.html', nombre: 'Dashboard',
      resumen: 'Cómo viene el mes y quién lo está moviendo.',
      descripcion: 'Indicadores y tendencias de la operación cerrada.',
      icono: 'chart'
    },
    {
      clave: 'auditoria', pagina: 'AuditoriaCP.html', nombre: 'Auditoría', sensible: true,
      resumen: 'Qué se cobró en una carta porte y por qué.',
      descripcion: 'Abre una carta porte ya cerrada y muestra su desglose pedido por pedido, ' +
                   'incluido el motivo de cada cobro en cero. Módulo sensible: enseña lo que se ' +
                   'facturó, así que se da solo a quien audita.',
      icono: 'search'
    },
    {
      /* Permiso, no pantalla: no tiene página propia, por eso no sale en el
         menú ni en el Inicio. Vive dentro de Auditoría y es lo que habilita
         corregir un cobro ya guardado. Se da desde Accesos como cualquier
         otro, y se da a poca gente: cambia la base. */
      clave: 'auditcobros', nombre: 'Corregir cobros', sensible: true,
      resumen: 'Cambiar lo que se cobró en una carta porte ya cerrada.',
      descripcion: 'Permiso dentro de Auditoría, no una pantalla aparte. Deja corregir la ' +
                   'tarifa de un pedido y guardar el cambio en la base, recalculando el ' +
                   'ingreso de esa carta porte. Se da solo a quien puede decidir un cobro.',
      icono: 'edit'
    },
    {
      clave: 'accesos', pagina: 'Registro.html', nombre: 'Accesos', sensible: true,
      resumen: 'Quién entra y hasta dónde.',
      descripcion: 'Usuarios del sistema y permisos de cada uno. Módulo sensible.',
      icono: 'shield'
    }
  ];

  const CLAVES = MODULOS.map(m => m.clave);

  // Perfiles por defecto: lo que ve alguien a quien todavía no le
  // configuraron accesos a mano.
  const PERFILES = {
    Administrador: ['inicio', 'simcp', 'proyeccion', 'dashboard', 'auditoria', 'auditcobros', 'accesos'],
    /* La auditoría NO entra en el perfil del ruteador: muestra lo facturado
       de cada pedido. Se da uno por uno desde Accesos. */
    Ruteador:      ['inicio', 'simcp', 'proyeccion']
  };

  // ======================================================================
  // ICONOS  (trazo de 1.75, 24x24, heredan currentColor)
  // ======================================================================
  const ICONOS = {
    home:    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/>',
    file:    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    target:  '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
    chart:   '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    shield:  '<path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
    sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:    '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5"/>',
    menu:    '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close:   '<path d="M18 6 6 18M6 6l12 12"/>',
    check:   '<path d="M20 6 9 17l-5-5"/>',
    alert:   '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    info:    '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    logout:  '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    plus:    '<path d="M12 5v14M5 12h14"/>',
    trash:   '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/><path d="M10 11v6M14 11v6"/>',
    edit:    '<path d="M11 4H4a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    key:     '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3M17 6l2.5 2.5M14.5 8.5 17 11"/>',
    search:  '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    refresh: '<path d="M21 4v6h-6"/><path d="M3 20v-6h6"/><path d="M20 10a8 8 0 0 0-14-3L3 10M4 14a8 8 0 0 0 14 3l3-3"/>',
    save:    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    down:    '<path d="M12 3v13"/><path d="m7 12 5 5 5-5"/><path d="M21 21H3"/>',
    truck:   '<path d="M3 16V6a1 1 0 0 1 1-1h10v11"/><path d="M14 9h3.5l2.5 3v4h-6"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    lock:    '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    user:    '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    box:     '<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>',
    inbox:   '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5.5 5h13l2.5 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z"/>'
  };

  function icono(nombre, clases) {
    const d = ICONOS[nombre] || ICONOS.info;
    return `<svg class="${clases || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }

  // ======================================================================
  // SESIÓN
  // ======================================================================
  const LLAVE_SESION = 'rentab.sesion';
  const LLAVE_TEMA   = 'rentab.tema';

  function leerSesion() {
    try { return JSON.parse(localStorage.getItem(LLAVE_SESION)); }
    catch (e) { return null; }
  }
  function guardarSesion(s) { localStorage.setItem(LLAVE_SESION, JSON.stringify(s)); }
  function cerrarSesion() {
    localStorage.removeItem(LLAVE_SESION);
    location.href = 'index.html';
  }

  function esSupremo(u) {
    if (!u) return false;
    const n = String(u.nombre || '').toLowerCase();
    const l = String(u.usuario || '').toLowerCase();
    return n.includes('hector torres') || n === 'hector' || l === 'hector';
  }

  /** Un administrador ve los datos de todos; cualquier otro rol solo ve
      lo que él mismo subió. Se usa para filtrar Dashboard, Auditoría y
      Proyección, no solo para dar o quitar el acceso a una pantalla. */
  function esAdministrador(u) {
    if (!u) return false;
    if (esSupremo(u)) return true;
    return String(u.rol || '').toLowerCase().includes('admin');
  }

  /** Filtra una lista de filas según quién puede verlas: un administrador
      se queda con todas, cualquier otro solo con las que él mismo cargó
      —comparando `campo` (por defecto «usuario») contra su login—.
      Se aplica apenas se bajan los datos, antes de armar filtros, gráficos
      o exportaciones, para que nadie pueda mirar lo de otro cambiando un
      desplegable o escribiendo otra carta porte a mano. */
  function soloLoMio(lista, u, campo) {
    campo = campo || 'usuario';
    if (!Array.isArray(lista)) return lista;
    if (esAdministrador(u)) return lista;
    const mio = String(u && u.usuario || '').toLowerCase().trim();
    if (!mio) return [];
    return lista.filter(x => String(x && x[campo] || '').toLowerCase().trim() === mio);
  }

  // ======================================================================
  // PERMISOS
  // ======================================================================
  function parsePermisos(valor) {
    if (Array.isArray(valor)) valor = valor.join(',');
    const s = String(valor == null ? '' : valor).trim();
    if (!s) return [];
    if (s === '*') return CLAVES.slice();
    return s.toLowerCase().split(/[,;\s]+/).filter(c => CLAVES.includes(c));
  }

  function serializarPermisos(lista) {
    const set = new Set(lista);
    return CLAVES.filter(c => set.has(c)).join(',');
  }

  function perfilPorRol(u) {
    const rol = String(u && u.rol || '').toLowerCase().includes('admin') ? 'Administrador' : 'Ruteador';
    return PERFILES[rol].slice();
  }

  /** Los módulos que esta persona puede abrir ahora mismo. */
  function permisosDe(u) {
    if (!u) return [];
    if (esSupremo(u)) return CLAVES.slice();
    const configurado = String(u.permisos == null ? '' : u.permisos).trim() !== '';
    const lista = configurado ? parsePermisos(u.permisos) : perfilPorRol(u);
    if (!lista.includes('inicio')) lista.push('inicio');
    return lista;
  }

  function puede(clave, u) { return permisosDe(u || leerSesion()).includes(clave); }
  function modulo(clave) { return MODULOS.find(m => m.clave === clave) || null; }

  /** Ciudades para los selectores. La del usuario siempre aparece, aunque
      no esté en la lista de config.js. */
  function ciudades(sesion) {
    const base = Array.isArray(CFG.CIUDADES) ? CFG.CIUDADES.slice() : [];
    const mia = String(sesion && sesion.ciudad || '').toUpperCase().trim();
    if (mia && !base.includes(mia)) base.unshift(mia);
    return base;
  }

  /** <option> listos, con la ciudad indicada preseleccionada. */
  function opcionesCiudad(sesion, seleccionada) {
    const sel = String(seleccionada || (sesion && sesion.ciudad) || '').toUpperCase();
    return ciudades(sesion)
      .map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c}</option>`)
      .join('');
  }

  // ======================================================================
  // FORMATO
  // ======================================================================
  const nfMoneda  = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfEntero  = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 });
  const nfDecimal = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const fmt = {
    money(n)   { const v = Number(n) || 0; return (v < 0 ? '−$' : '$') + nfMoneda.format(Math.abs(v)); },
    moneyK(n)  { const v = Number(n) || 0;
                 if (Math.abs(v) >= 1000) return (v < 0 ? '−$' : '$') + nfDecimal.format(Math.abs(v) / 1000) + 'k';
                 return (v < 0 ? '−$' : '$') + nfEntero.format(Math.abs(v)); },
    num(n)     { return nfEntero.format(Number(n) || 0); },
    dec(n, d)  { return new Intl.NumberFormat('es-EC', { minimumFractionDigits: d ?? 1, maximumFractionDigits: d ?? 1 }).format(Number(n) || 0); },
    pct(n)     { return nfDecimal.format(Number(n) || 0) + '%'; },
    /** '2026-09-10' → '10 sep 2026' (sin saltos de zona horaria) */
    fecha(iso) {
      if (!iso) return '—';
      const p = String(iso).slice(0, 10).split('-');
      if (p.length !== 3) return iso;
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      return `${Number(p[2])} ${meses[Number(p[1]) - 1]} ${p[0]}`;
    },
    fechaCorta(iso) {
      if (!iso) return '—';
      const p = String(iso).slice(0, 10).split('-');
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      return `${Number(p[2])} ${meses[Number(p[1]) - 1]}`;
    },
    hoy() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
    iniciales(nombre) {
      return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    }
  };

  /** Convierte lo que sea a número: '$1.234,50', '1,5', 45, null… */
  function aNumero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    let s = String(v).replace(/[^0-9.,-]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s) || 0;
  }

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ======================================================================
  // TEMA
  // ======================================================================
  function temaGuardado() {
    const t = localStorage.getItem(LLAVE_TEMA);
    if (t === 'dark' || t === 'light') return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function aplicarTema(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(LLAVE_TEMA, t);
  }
  function alternarTema() {
    aplicarTema(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    global.dispatchEvent(new CustomEvent('app:tema'));
  }
  // Se aplica de inmediato, antes de pintar, para que no haya destello blanco
  aplicarTema(temaGuardado());

  // ======================================================================
  // INTERFAZ: toast, confirmar, pedir
  // ======================================================================
  function hostToasts() {
    let h = document.querySelector('.toast-host');
    if (!h) { h = document.createElement('div'); h.className = 'toast-host'; h.setAttribute('role', 'status'); h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); }
    return h;
  }

  function toast(mensaje, tipo = 'ok', ms = 3600) {
    const ico = tipo === 'danger' ? 'alert' : tipo === 'warn' ? 'alert' : tipo === 'info' ? 'info' : 'check';
    const el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.innerHTML = icono(ico) + `<div>${mensaje}</div>`;
    hostToasts().appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, ms);
  }

  function dialogo({ titulo, cuerpo, aceptar = 'Aceptar', cancelar = 'Cancelar', tono = 'primary', campo = null }) {
    return new Promise(resolve => {
      const dlg = document.createElement('dialog');
      dlg.className = 'modal';
      dlg.innerHTML = `
        <form method="dialog">
          <div class="modal-head">
            <h3>${titulo}</h3>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" data-x aria-label="Cerrar">${icono('close')}</button>
          </div>
          <div class="modal-body">
            <div class="soft">${cuerpo || ''}</div>
            ${campo ? `<div class="field mt-4">
                <label for="dlg-campo">${campo.label || 'Valor'}</label>
                <input id="dlg-campo" type="${campo.tipo || 'text'}" value="${escapar(campo.valor ?? '')}"
                       ${campo.paso ? `step="${campo.paso}"` : ''} ${campo.min != null ? `min="${campo.min}"` : ''}
                       placeholder="${escapar(campo.placeholder || '')}">
                ${campo.ayuda ? `<div class="help">${campo.ayuda}</div>` : ''}
              </div>` : ''}
          </div>
          <div class="modal-foot">
            <button type="button" class="btn btn-default" data-no>${cancelar}</button>
            <button type="button" class="btn btn-${tono}" data-si>${aceptar}</button>
          </div>
        </form>`;
      document.body.appendChild(dlg);

      const input = dlg.querySelector('#dlg-campo');
      const cerrar = (valor) => { dlg.close(); dlg.remove(); resolve(valor); };

      dlg.querySelector('[data-si]').onclick = () => cerrar(campo ? (input ? input.value : '') : true);
      dlg.querySelector('[data-no]').onclick = () => cerrar(null);
      dlg.querySelector('[data-x]').onclick  = () => cerrar(null);
      dlg.addEventListener('cancel', e => { e.preventDefault(); cerrar(null); });

      dlg.showModal();
      if (input) { input.focus(); input.select();
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cerrar(input.value); } });
      }
    });
  }

  const confirmar = (titulo, cuerpo, opts = {}) =>
    dialogo({ titulo, cuerpo, aceptar: opts.aceptar || 'Confirmar', tono: opts.tono || 'primary' });

  const pedir = (titulo, cuerpo, campo) =>
    dialogo({ titulo, cuerpo, campo, aceptar: 'Guardar' });

  /**
   * Campo donde se pegan cartas porte o números de pedido.
   *
   * Lo normal es copiar una columna de Excel, y Excel entrega los números ya
   * formateados: 69.304 en vez de 69304, a veces con espacio de miles, y con
   * un salto de línea entre celdas. Este campo acepta todo eso y muestra
   * cuántos códigos entendió, para que nadie descubra que faltaba uno recién
   * después de esperar la búsqueda.
   *
   * Devuelve la función que entrega la lista limpia.
   */
  function campoCodigos(area, salida, opciones = {}) {
    if (typeof area === 'string')   area = document.getElementById(area);
    if (typeof salida === 'string') salida = document.getElementById(salida);
    if (!area) return () => [];

    const uno    = opciones.uno || 'código';
    const varios = opciones.varios || 'códigos';
    const ayuda  = opciones.ayuda || 'Uno por línea, o separados por coma. Se puede pegar la columna de Excel.';
    const leer   = () => (global.API ? API.listaDeCodigos(area.value) : []);

    /* Crece con el contenido hasta el tope del CSS. Pegar quince cartas
       porte en una caja de tres líneas obliga a desplazarse para revisar lo
       que uno acaba de pegar, que es justo cuando conviene poder mirarlo. */
    const ALTO_MAX = 260;
    function ajustarAlto() {
      area.style.height = 'auto';
      area.style.height = Math.min(area.scrollHeight + 2, ALTO_MAX) + 'px';
      area.style.overflowY = area.scrollHeight > ALTO_MAX ? 'auto' : 'hidden';
    }

    function pintar() {
      ajustarAlto();
      if (!salida) return;
      const lista = leer();

      if (!lista.length) { salida.innerHTML = `<span>${ayuda}</span>`; return; }

      // Cuántos venían con separador de miles metido dentro del número.
      const conFormato = (area.value.match(/\d[.,\u00A0 ]\d{3}(?!\d)/g) || []).length;

      salida.innerHTML =
        `<b>${lista.length}</b><span>${lista.length === 1 ? uno : varios}</span>` +
        (conFormato
          ? `<span class="corregidos">· ${conFormato} ${conFormato === 1 ? 'venía' : 'venían'} con separador de miles, ya ${conFormato === 1 ? 'corregido' : 'corregidos'}</span>`
          : '');
    }

    area.addEventListener('input', pintar);
    // El pegado dispara `input`, pero no siempre antes de que el valor esté
    // completo en Firefox. Un tick después siempre está.
    area.addEventListener('paste', () => setTimeout(pintar, 0));

    if (opciones.alEnviar) {
      area.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); opciones.alEnviar(); }
      });
    }

    pintar();
    return leer;
  }

  /** Marca un botón como ocupado y devuelve la función que lo libera. */
  function ocupar(btn, texto = 'Procesando…') {
    if (!btn) return () => {};
    const original = btn.innerHTML;
    btn.dataset.loading = 'true';
    btn.innerHTML = `<span class="spin"></span> ${texto}`;
    return () => { btn.innerHTML = original; delete btn.dataset.loading; };
  }

  // ======================================================================
  // NAVEGACIÓN
  // ======================================================================
  function paginaActual() {
    const f = location.pathname.split('/').pop();
    return (!f || !f.includes('.')) ? 'Inicio.html' : f;
  }

  /* Pie con la autoría. Va en todas las pantallas por el mismo sitio por el
     que va la barra de arriba, así ninguna se queda sin él y no hay que
     acordarse de copiarlo al crear una pantalla nueva. */
  function pintarPie() {
    if (document.querySelector('footer.pie')) return;
    const cfg = global.CONFIG || {};
    const autor = cfg.AUTOR || '';
    const anio = cfg.ANIO || new Date().getFullYear();
    const pie = document.createElement('footer');
    pie.className = 'pie';
    pie.innerHTML = `<span>${escapar(cfg.APP_NOMBRE || 'Rentabilidad')}` +
      `${cfg.APP_AREA ? ' · ' + escapar(cfg.APP_AREA) : ''}</span>` +
      `<span>© ${anio}${autor ? ' ' + escapar(autor) : ''}. Todos los derechos reservados.</span>`;
    document.body.appendChild(pie);
  }

  function pintarTopbar(sesion) {
    const permitidos = permisosDe(sesion);
    const actual = paginaActual();

    const enlaces = MODULOS
      /* Los que no tienen página son permisos, no pantallas: se configuran en
         Accesos pero no ocupan un lugar en el menú. */
      .filter(m => m.pagina && permitidos.includes(m.clave))
      .map(m => `<a href="${m.pagina}" ${m.pagina === actual ? 'aria-current="page"' : ''}>${icono(m.icono)}${m.nombre}</a>`)
      .join('');

    const bar = document.createElement('header');
    bar.className = 'topbar';
    bar.innerHTML = `
      <a class="brand" href="Inicio.html" style="text-decoration:none">
        <img class="brand-logo" src="assets/logo.png" alt="" width="32" height="32">
        <span>${escapar(CFG.APP_NOMBRE || 'Rentabilidad')}<small>${escapar(CFG.APP_AREA || '')}</small></span>
      </a>

      <button class="theme-toggle nav-toggle" type="button" aria-label="Menú" aria-expanded="false" data-menu>
        ${icono('menu')}
      </button>

      <nav class="nav" id="nav-principal">${enlaces}</nav>

      <div class="topbar-end">
        <button class="theme-toggle" type="button" data-refrescar
                aria-label="Actualizar datos" title="Volver a leer la hoja de Drive">
          ${icono('refresh')}
        </button>
        <button class="theme-toggle" type="button" data-tema aria-label="Cambiar entre tema claro y oscuro">
          ${icono('sun', 'icon-sun')}${icono('moon', 'icon-moon')}
        </button>
        <div class="who">
          <span class="who-avatar">${escapar(fmt.iniciales(sesion.nombre))}</span>
          <span class="who-text">
            <b>${escapar(sesion.nombre)}</b>
            <span>${escapar(sesion.rol || '')}${sesion.ciudad ? ' · ' + escapar(sesion.ciudad) : ''}</span>
          </span>
        </div>
        <button class="theme-toggle" type="button" data-salir aria-label="Cerrar sesión" title="Cerrar sesión">
          ${icono('logout')}
        </button>
      </div>`;

    document.body.prepend(bar);

    bar.querySelector('[data-tema]').onclick = alternarTema;

    /* Volver a leer la hoja ahora mismo, sin esperar a que caduque el caché.
       Lo necesita cualquiera, no solo un administrador: quien corrige una
       tarifa en Drive quiere verla aplicada de inmediato. El diagnóstico del
       Inicio no hace esto — solo comprueba que las hojas respondan. */
    const btnRefrescar = bar.querySelector('[data-refrescar]');
    btnRefrescar.onclick = async function () {
      if (!global.API) return;
      this.disabled = true;
      this.classList.add('girando');
      toast('Buscando pedidos nuevos en el monitor…', 'info', 6000);

      try {
        // Primero el servidor relee el Excel; después se tira el caché de aquí.
        const r = await API.refrescarMonitor();
        toast(r.actualizado
          ? `Monitor actualizado: ${fmt.num(r.filas)} pedidos.`
          : 'El monitor ya estaba al día.', 'ok', 2000);
      } catch (e) {
        // Si el backend todavía no tiene la acción, al menos se recarga lo de aquí
        API.limpiarCache();
        toast('Se volvió a leer la hoja. El monitor no se pudo refrescar: ' + e.message, 'warn', 5000);
      }
      setTimeout(() => location.reload(), 900);
    };
    bar.querySelector('[data-salir]').onclick = async () => {
      if (await confirmar('Cerrar sesión', '¿Salir del sistema?', { aceptar: 'Salir' })) cerrarSesion();
    };

    // Menú en pantallas angostas
    const nav = bar.querySelector('#nav-principal');
    const botonMenu = bar.querySelector('[data-menu]');
    const esAngosto = () => matchMedia('(max-width: 860px)').matches;
    const sincronizar = () => { if (esAngosto()) nav.hidden = true; else nav.hidden = false; };
    sincronizar();
    addEventListener('resize', sincronizar);
    botonMenu.onclick = () => {
      nav.hidden = !nav.hidden;
      botonMenu.setAttribute('aria-expanded', String(!nav.hidden));
    };
  }

  /**
   * Si el administrador cambió los permisos mientras la persona ya estaba
   * dentro, se detecta al abrir la siguiente pantalla, sin obligarla a
   * volver a iniciar sesión. Si el backend no tiene la acción, no molesta.
   */
  function refrescarPermisos(sesion) {
    if (!global.API || !API.permisosDe) return;
    const login = String(sesion.usuario || sesion.nombre || '').trim();
    if (!login) return;

    API.permisosDe(login).then(d => {
      if (!d) return;
      const cambio = d.permisos !== String(sesion.permisos || '') ||
                     (d.rol && d.rol !== String(sesion.rol || ''));
      if (!cambio) return;

      sesion.permisos = d.permisos;
      if (d.rol) sesion.rol = d.rol;
      guardarSesion(sesion);

      const clave = document.body.dataset.modulo;
      if (clave && !puede(clave, sesion)) {
        const m = modulo(clave);
        bloquear(m ? m.nombre : 'esta pantalla');
        return;
      }

      // El menú debe reflejar los accesos nuevos, pero se recarga una sola
      // vez: si el servidor devolviera siempre un valor distinto al guardado,
      // sin este tope la página quedaría recargándose en bucle.
      if (!sessionStorage.getItem('rentab.refrescado')) {
        sessionStorage.setItem('rentab.refrescado', '1');
        location.reload();
      }
    }).catch(() => {});
  }

  // ======================================================================
  // TRANSICIÓN ENTRE PANTALLAS
  // ----------------------------------------------------------------------
  // Son cinco páginas sueltas que se recargan de verdad. Sin nada de por
  // medio, el navegador deja la pantalla en blanco un instante y se siente
  // como cambiar de sitio web. Aquí el contenido sale con un desvanecido
  // corto y entra con otro: la barra superior nunca se mueve, así que
  // parece una sola aplicación cambiando de contenido.
  //
  // La salida dura 140 ms a propósito. Más que eso se percibe como demora.
  // ======================================================================
  const MS_SALIDA = 160;

  const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Barra fina de carga en el borde superior mientras llega la otra pantalla. */
  function barraCarga() {
    const b = document.createElement('div');
    b.className = 'barra-carga';
    document.body.appendChild(b);
    requestAnimationFrame(() => b.classList.add('va'));
    return b;
  }

  /** Hacia dónde vamos según el orden del menú: sirve para que el contenido
      salga por el lado que corresponde. */
  function direccion(destino) {
    const indice = p => MODULOS.findIndex(m => m.pagina === p);
    const de = indice(paginaActual());
    const a  = indice(String(destino).split(/[?#]/)[0]);
    if (de < 0 || a < 0 || de === a) return '';
    return a > de ? 'der' : 'izq';
  }

  function salir(destino) {
    document.body.dataset.dir = direccion(destino);
    document.body.classList.add('saliendo');
    barraCarga();
    setTimeout(() => { location.href = destino; }, MS_SALIDA);
  }

  function animarNavegacion() {
    // Volver con el botón «atrás» restaura la página desde caché sin
    // ejecutar nada: si no se quita la clase, queda invisible.
    addEventListener('pageshow', e => {
      if (e.persisted) {
        document.body.classList.remove('saliendo');
        document.querySelectorAll('.barra-carga').forEach(b => b.remove());
      }
    });

    if (sinMovimiento()) return;

    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const a = e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;

      const destino = a.getAttribute('href');
      if (!destino || destino.startsWith('#') || /^[a-z]+:/i.test(destino)) return;   // anclas, mailto:, http://…
      if (!/\.html?($|[?#])/i.test(destino)) return;                                  // solo pantallas del sistema
      if (destino.split(/[?#]/)[0] === paginaActual()) return;                        // ya estamos aquí

      e.preventDefault();
      a.classList.add('yendo');
      salir(destino);
    });
  }

  /** Navegar por código respetando la misma animación. */
  function ir(destino) {
    if (sinMovimiento()) { location.href = destino; return; }
    salir(destino);
  }

  function bloquear(nombreModulo) {
    document.body.innerHTML = `
      <div class="lockout">
        <div class="box">
          <div class="ico">${icono('lock')}</div>
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para abrir <b>${escapar(nombreModulo)}</b>.
             Si necesitas entrar, pídeselo al administrador del sistema.</p>
          <a class="btn btn-primary" href="Inicio.html">Volver al inicio</a>
        </div>
      </div>`;
  }

  // ======================================================================
  // ARRANQUE
  // ======================================================================
  /** Cierra la sesión sola tras el tiempo configurado sin actividad. */
  function vigilarInactividad() {
    const minutos = Number(CFG.MINUTOS_INACTIVIDAD || 0);
    if (!minutos) return;
    let t;
    const reiniciar = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!leerSesion()) return;
        localStorage.removeItem(LLAVE_SESION);
        location.href = 'index.html?expirada=1';
      }, minutos * 60000);
    };
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
      .forEach(ev => document.addEventListener(ev, reiniciar, { passive: true }));
    reiniciar();
  }

  function montar() {
    const enLogin = /(^|\/)index\.html?$/i.test(location.pathname) || /\/$/.test(location.pathname);
    const sesion = leerSesion();

    if (enLogin) return null;

    if (!sesion) { location.replace('index.html'); return null; }

    const claveModulo = document.body.dataset.modulo;
    if (claveModulo && !puede(claveModulo, sesion)) {
      const m = modulo(claveModulo);
      bloquear(m ? m.nombre : 'esta pantalla');
      return null;
    }

    pintarTopbar(sesion);
    pintarPie();
    vigilarInactividad();
    refrescarPermisos(sesion);
    animarNavegacion();

    /* Se adelanta la descarga pesada mientras la persona lee esta pantalla.
       Cada pantalla pide lo suyo y, de paso, lo de la siguiente probable. */
    if (global.API && API.precargar) {
      const segun = {
        inicio:     ['tarifario', 'monitor'],
        simcp:      ['rutas'],
        proyeccion: ['rutas'],
        dashboard:  ['monitor']
      };
      const pedir = segun[claveModulo];
      if (pedir) API.precargar(pedir);
    }

    /* Cuando una revalidación de fondo trae datos distintos a los que están
       en pantalla, se avisa en vez de cambiarlos por debajo: alguien podría
       estar a mitad de un cálculo. La decisión de recargar es suya. */
    const avisados = new Set();
    addEventListener('datos:actualizados', e => {
      const llave = e.detail && e.detail.llave;
      if (avisados.has(llave)) return;
      avisados.add(llave);
      toast('Hay datos más recientes en la hoja. <a href="#" data-recargar>Actualizar pantalla</a>', 'info', 9000);
    });
    document.addEventListener('click', e => {
      if (e.target.closest('[data-recargar]')) { e.preventDefault(); location.reload(); }
    });

    return sesion;
  }

  // ======================================================================
  // API PÚBLICA
  // ======================================================================
  global.FX = {
    MODULOS, CLAVES, PERFILES,
    icono, escapar, fmt, aNumero, ciudades, opcionesCiudad,
    leerSesion, guardarSesion, cerrarSesion, esSupremo, esAdministrador, soloLoMio,
    permisosDe, parsePermisos, serializarPermisos, perfilPorRol, puede, modulo,
    toast, confirmar, pedir, dialogo, ocupar, campoCodigos,
    alternarTema, montar, paginaActual, ir,
    /** Se resuelve con la sesión cuando el DOM está listo, o nunca si la página se bloqueó. */
    listo(callback) {
      const arrancar = () => { const s = montar(); if (s || document.body.dataset.modulo === undefined) callback(s); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
      else arrancar();
    }
  };
})(window);
