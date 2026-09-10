/* =========================================
   1. BLOQUEO DE CÓDIGO FUENTE (Candado Visual)
   ========================================= */
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

document.onkeydown = function(e) {
    if (e.keyCode === 123) { return false; } // F12
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) { return false; } // Ctrl+Shift+I
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) { return false; } // Ctrl+Shift+J
    if (e.ctrlKey && e.keyCode === 85) { return false; } // Ctrl+U
};

/* =========================================
   2. CIERRE DE SESIÓN POR INACTIVIDAD (15 MINUTOS)
   ========================================= */
let tiempoInactividad;

function cerrarSesionPorInactividad() {
    if(localStorage.getItem('sesionActiva')) {
        alert("⏱️ Por tu seguridad, la sesión ha expirado tras 15 minutos de inactividad.");
        localStorage.removeItem('sesionActiva');
        window.location.href = 'index.html';
    }
}

function resetearTemporizador() {
    clearTimeout(tiempoInactividad);
    tiempoInactividad = setTimeout(cerrarSesionPorInactividad, 900000);
}

// Se usa addEventListener para no pisar el window.onload propio de cada página
window.addEventListener('load', resetearTemporizador);
document.addEventListener('mousemove', resetearTemporizador);
document.addEventListener('keypress', resetearTemporizador);
document.addEventListener('click', resetearTemporizador);
document.addEventListener('scroll', resetearTemporizador);

/* =========================================
   3. FIRMA DEL DESARROLLADOR (Marca de agua)
   ========================================= */
document.addEventListener('DOMContentLoaded', function() {
    const firma = document.createElement('div');
    firma.textContent = "Elaborado por: Hector Torres";
    firma.style.position = 'fixed';
    firma.style.bottom = '10px';
    firma.style.left = '10px';
    firma.style.fontSize = '11px';
    firma.style.color = '#64748b';
    firma.style.opacity = '0.3';
    firma.style.zIndex = '9999';
    firma.style.pointerEvents = 'none';
    firma.style.fontFamily = 'Arial, sans-serif';
    firma.style.userSelect = 'none';
    document.body.appendChild(firma);
});

// =========================================================================
// 🛡️ MOTOR CENTRAL DE ACCESOS POR USUARIO (FlexNet)
// -------------------------------------------------------------------------
// Los permisos ya NO se escriben a mano en este archivo.
// Se administran desde Registro.html y viajan en la sesión del usuario.
// Este archivo solo los interpreta y los aplica.
// =========================================================================
(function () {
    'use strict';

    // -----------------------------------------------------------------
    // CATÁLOGO DE MÓDULOS DEL SISTEMA
    // Para agregar un módulo nuevo al sistema, basta con sumarlo aquí:
    // aparecerá solo en la pantalla de Accesos y quedará protegido.
    // -----------------------------------------------------------------
    var MODULOS = [
        { clave: 'inicio', pagina: 'Inicio.html', nombre: 'Inicio', icono: '🏠', fijo: true,
          descripcion: 'Panel principal. Siempre visible para todos.',
          ids: ['linkInicio'] },

        { clave: 'proyeccion', pagina: 'ProyeccionGlobal.html', nombre: 'Proyección', icono: '🔭',
          descripcion: 'Proyección global de rutas e ingresos.',
          ids: ['linkProyeccion', 'cardProyeccion'] },

        { clave: 'simids', pagina: 'Simulador.html', nombre: 'Sim. IDs', icono: '📝',
          descripcion: 'Simulador de costos por IDs de pedido.',
          ids: ['linkSimIDs', 'cardSimuladorIds', 'cardSimIDs'] },

        { clave: 'simcp', pagina: 'SimuladorCartaPorte.html', nombre: 'Sim. CP', icono: '📄',
          descripcion: 'Simulador de costos por Carta Porte.',
          ids: ['linkSimCP', 'cardSimuladorCp', 'cardSimCP'] },

        { clave: 'masivo', pagina: 'AuditorMasivo.html', nombre: 'Masivo', icono: '⚡',
          descripcion: 'Auditor masivo de pedidos.',
          ids: ['linkMasivo', 'cardMasivo'] },

        { clave: 'auditoria', pagina: 'AuditoriaRutas.html', nombre: 'Auditoría', icono: '🔍',
          descripcion: 'Auditoría de rutas ya guardadas.',
          ids: ['linkAuditoria', 'cardAuditoria'] },

        { clave: 'rentabilidad', pagina: 'Rentabilidad.html', nombre: 'Rentabilidad', icono: '📊',
          descripcion: 'Rentabilidad general del negocio.',
          ids: ['linkRentabilidad', 'cardRentabilidad'] },

        { clave: 'vehiculos', pagina: 'RentabilidadVehiculos.html', nombre: 'Vehículos', icono: '🚛',
          descripcion: 'Rentabilidad detallada por vehículo.',
          ids: ['linkVehiculos', 'cardVehiculos'] },

        { clave: 'dashboard', pagina: 'Reportes.html', nombre: 'Dashboard', icono: '📈',
          descripcion: 'Tablero de reportes e indicadores.',
          ids: ['linkReportes', 'cardReportes'] },

        { clave: 'accesos', pagina: 'Registro.html', nombre: 'Accesos', icono: '🛡️', sensible: true,
          descripcion: 'Alta de usuarios y control de permisos. Módulo sensible.',
          ids: ['linkRegistro', 'cardRegistro'] }
    ];

    // -----------------------------------------------------------------
    // PERFILES POR DEFECTO (se usan cuando el usuario aún no tiene
    // permisos configurados a mano). Replican el comportamiento histórico
    // del sistema para que nadie pierda accesos al activar esta versión.
    // -----------------------------------------------------------------
    var DEFAULT_ADMIN    = ['inicio', 'proyeccion', 'simcp', 'dashboard', 'accesos'];
    var DEFAULT_RUTEADOR = ['inicio', 'proyeccion', 'simcp'];

    // Excepciones históricas que estaban escritas a mano en este archivo.
    // Solo aplican mientras esa persona NO tenga permisos propios guardados.
    var EXCEPCIONES_LEGADO = {
        'leonardo flores': ['auditoria', 'masivo', 'dashboard'],
        'esteban':         ['dashboard']
    };

    var TODOS = MODULOS.map(function (m) { return m.clave; });

    // -----------------------------------------------------------------
    // HELPERS
    // -----------------------------------------------------------------
    function texto(v) { return String(v === undefined || v === null ? '' : v).trim(); }

    function parsePermisos(valor) {
        if (Array.isArray(valor)) valor = valor.join(',');
        var str = texto(valor);
        if (!str) return [];
        if (str === '*' || str.toUpperCase() === 'TODO') return TODOS.slice();

        var claves = str.toLowerCase().split(/[,;|\s]+/).filter(Boolean);
        // Solo se aceptan claves que existan en el catálogo (ignora basura)
        return claves.filter(function (c) { return TODOS.indexOf(c) > -1; });
    }

    function serializarPermisos(lista) {
        if (!Array.isArray(lista)) return '';
        var limpias = lista.filter(function (c) { return TODOS.indexOf(c) > -1; });
        // Se guarda en el orden del catálogo para que la celda sea legible
        return TODOS.filter(function (c) { return limpias.indexOf(c) > -1; }).join(',');
    }

    function esSupremo(usuarioObj) {
        if (!usuarioObj) return false;
        var n = texto(usuarioObj.nombre).toLowerCase();
        var u = texto(usuarioObj.usuario).toLowerCase();
        return n.indexOf('hector torres') > -1 || n === 'hector' || u === 'hector';
    }

    function defaultPorRol(usuarioObj) {
        var rol = texto(usuarioObj && usuarioObj.rol).toLowerCase();
        var nombre = texto(usuarioObj && usuarioObj.nombre).toLowerCase();
        var base = rol.indexOf('admin') > -1 ? DEFAULT_ADMIN.slice() : DEFAULT_RUTEADOR.slice();

        Object.keys(EXCEPCIONES_LEGADO).forEach(function (clave) {
            if (nombre.indexOf(clave) > -1) {
                EXCEPCIONES_LEGADO[clave].forEach(function (extra) {
                    if (base.indexOf(extra) === -1) base.push(extra);
                });
            }
        });
        return base;
    }

    // Permisos reales que rigen para un usuario en este momento
    function permisosEfectivos(usuarioObj) {
        if (!usuarioObj) return [];
        if (esSupremo(usuarioObj)) return TODOS.slice();

        var lista = parsePermisos(usuarioObj.permisos);
        var configurado = texto(usuarioObj.permisos) !== '';

        // Sin configurar todavía -> se respeta el comportamiento histórico por rol
        if (!configurado) lista = defaultPorRol(usuarioObj);

        // Inicio nunca se quita: es la pantalla de aterrizaje del sistema
        if (lista.indexOf('inicio') === -1) lista.push('inicio');
        return lista;
    }

    function paginaActual() {
        var path = window.location.pathname;
        var archivo = path.split('/').pop();
        if (!archivo || archivo.indexOf('.') === -1) archivo = 'Inicio.html';
        return archivo;
    }

    function moduloDePagina(pagina) {
        var p = texto(pagina).toLowerCase();
        for (var i = 0; i < MODULOS.length; i++) {
            if (MODULOS[i].pagina.toLowerCase() === p) return MODULOS[i];
        }
        return null;
    }

    // -----------------------------------------------------------------
    // API PÚBLICA (la usa Registro.html para dibujar el panel de accesos)
    // -----------------------------------------------------------------
    window.FLEXNET_ACCESOS = {
        MODULOS: MODULOS,
        TODAS_LAS_CLAVES: TODOS,
        DEFAULT_ADMIN: DEFAULT_ADMIN,
        DEFAULT_RUTEADOR: DEFAULT_RUTEADOR,
        parse: parsePermisos,
        serializar: serializarPermisos,
        esSupremo: esSupremo,
        defaultPorRol: defaultPorRol,
        efectivos: permisosEfectivos,
        nombreDe: function (clave) {
            for (var i = 0; i < MODULOS.length; i++) {
                if (MODULOS[i].clave === clave) return MODULOS[i].nombre;
            }
            return clave;
        }
    };

    // -----------------------------------------------------------------
    // PANTALLA DE BLOQUEO (reemplaza el alert() bloqueante)
    // -----------------------------------------------------------------
    function mostrarBloqueo(nombreModulo) {
        var capa = document.createElement('div');
        capa.setAttribute('role', 'alert');
        capa.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;' +
            'justify-content:center;background:#070b14;color:#f8fafc;font-family:Inter,Arial,sans-serif;padding:24px;text-align:center;';
        capa.innerHTML =
            '<div style="max-width:420px;">' +
                '<div style="font-size:56px;line-height:1;margin-bottom:18px;">🔒</div>' +
                '<h1 style="font-size:1.35em;margin:0 0 10px;font-weight:800;">Acceso restringido</h1>' +
                '<p style="color:#94a3b8;line-height:1.6;margin:0 0 22px;font-size:0.95em;">' +
                    'No tienes permiso para entrar a <b style="color:#f8fafc;">' + (nombreModulo || 'este módulo') + '</b>.<br>' +
                    'Si necesitas acceso, solicítalo al administrador del sistema.' +
                '</p>' +
                '<a href="Inicio.html" style="display:inline-block;padding:12px 22px;border-radius:8px;border:1px solid #00f0ff;' +
                    'color:#00f0ff;background:rgba(0,240,255,0.1);text-decoration:none;font-weight:700;">Volver al Inicio</a>' +
                '<p style="color:#475569;font-size:0.8em;margin-top:18px;">Redirigiendo automáticamente…</p>' +
            '</div>';

        // Se limpia la página para que el contenido restringido no alcance a verse
        document.body.innerHTML = '';
        document.body.appendChild(capa);
        setTimeout(function () { window.location.replace('Inicio.html'); }, 2600);
    }

    // -----------------------------------------------------------------
    // APLICACIÓN DE PERMISOS SOBRE LA PÁGINA
    // -----------------------------------------------------------------
    // Se lleva registro de lo que este motor ocultó, para poder devolverlo
    // a la vista si al usuario le acaban de otorgar ese módulo. Sin esto,
    // un permiso recién concedido no aparecería hasta recargar dos veces.
    var ocultadosPorPermisos = [];

    function restaurarOcultos() {
        ocultadosPorPermisos.forEach(function (o) { o.el.style.display = o.previo; });
        ocultadosPorPermisos = [];
    }

    function ocultarElemento(el) {
        if (!el || el.style.display === 'none') return;
        ocultadosPorPermisos.push({ el: el, previo: el.style.display });
        el.style.display = 'none';
    }

    function aplicarPermisos(sesion) {
        var permitidos = permisosEfectivos(sesion);
        var actual = paginaActual();
        var modActual = moduloDePagina(actual);

        // A. BARRERA: impide entrar escribiendo la URL a mano
        if (modActual && permitidos.indexOf(modActual.clave) === -1) {
            mostrarBloqueo(modActual.nombre);
            return false;
        }

        // B. OCULTAR TODO LO QUE NO ESTÁ PERMITIDO
        //    (primero se devuelve a la vista lo ocultado antes, para que este
        //     método se pueda volver a ejecutar con permisos nuevos)
        restaurarOcultos();

        MODULOS.forEach(function (m) {
            if (permitidos.indexOf(m.clave) > -1) return;

            // B1. Por ID conocido (links del menú y tarjetas del Inicio)
            (m.ids || []).forEach(function (id) {
                ocultarElemento(document.getElementById(id));
            });

            // B2. Por href, a prueba de fallos: cualquier enlace a esa página desaparece,
            //     aunque no tenga ID o se haya agregado después.
            var enlaces = document.querySelectorAll('a[href="' + m.pagina + '"], a[href="./' + m.pagina + '"]');
            Array.prototype.forEach.call(enlaces, function (a) {
                ocultarElemento(a.closest('.card, .modulo, li') || a);
            });
        });

        // C. ILUMINAR EL BOTÓN DEL MENÚ DE LA PÁGINA ACTUAL
        var navLinks = document.querySelectorAll('.nav-links a');
        Array.prototype.forEach.call(navLinks, function (link) {
            if (link.getAttribute('href') === actual) link.classList.add('active');
        });

        return true;
    }

    // -----------------------------------------------------------------
    // REFRESCO SILENCIOSO
    // Si el administrador cambió los permisos mientras la persona ya estaba
    // conectada, se detecta al abrir la siguiente página (sin volver a entrar).
    // Si el backend todavía no tiene la acción, falla en silencio y no molesta.
    // -----------------------------------------------------------------
    function refrescarPermisos(sesion) {
        if (typeof SCRIPT_URL === 'undefined' || !SCRIPT_URL) return;

        var login = texto(sesion.usuario) || texto(sesion.nombre);
        if (!login) return;

        var url = SCRIPT_URL + '?action=getPermisos&usuario=' + encodeURIComponent(login) + '&v=' + new Date().getTime();

        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d || d.status !== 'success') return;

                var nuevos = texto(d.permisos);
                var nuevoRol = texto(d.rol);
                var cambioPermisos = nuevos !== texto(sesion.permisos);
                var cambioRol = nuevoRol && nuevoRol !== texto(sesion.rol);

                if (!cambioPermisos && !cambioRol) return;

                sesion.permisos = nuevos;
                if (nuevoRol) sesion.rol = nuevoRol;
                localStorage.setItem('sesionActiva', JSON.stringify(sesion));

                // Se vuelven a aplicar: si le quitaron el acceso a esta misma
                // página, la barrera lo saca de inmediato.
                aplicarPermisos(sesion);
            })
            .catch(function () { /* sin conexión: se mantienen los permisos de la sesión */ });
    }

    // -----------------------------------------------------------------
    // ARRANQUE
    // -----------------------------------------------------------------
    var enLogin = /(^|\/)index\.html?$/i.test(window.location.pathname) ||
                  window.location.pathname === '/' ||
                  window.location.pathname === '';

    var sesion = null;
    try { sesion = JSON.parse(localStorage.getItem('sesionActiva')); } catch (e) { sesion = null; }

    if (!sesion && !enLogin) {
        window.location.href = 'index.html';
        return;
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!sesion || enLogin) return;
        var ok = aplicarPermisos(sesion);
        if (ok) refrescarPermisos(sesion);
    });
})();
