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
   2. CIERRE DE SESIÓN POR INACTIVIDAD (10 MINUTOS)
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

window.onload = resetearTemporizador;
document.onmousemove = resetearTemporizador;
document.onkeypress = resetearTemporizador;
document.onclick = resetearTemporizador;
document.onscroll = resetearTemporizador;

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
// 🛡️ MOTOR CENTRAL DE SEGURIDAD Y PERMISOS ENCAPSULADO
// =========================================================================
(function() {
    const authLocal = JSON.parse(localStorage.getItem('sesionActiva'));

    if (!authLocal && !window.location.href.includes('index.html')) {
        window.location.href = 'index.html';
        return; 
    }

    const Permisos = {
        Administrador: {
            paginasBloqueadas: [], 
            elementosOcultos: [] 
        },
        Ruteador: {
            paginasBloqueadas: [
                'Registro.html', 
                'Reportes.html', 
                'AuditoriaRutas.html',
                'AuditorMasivo.html' 
            ],
            elementosOcultos: [
                'linkRegistro', 'cardRegistro', 
                'linkReportes', 'cardReportes', 
                'linkAuditoria', 'cardAuditoria',
                'linkMasivo', 'cardMasivo',
                'boxFiltroRegion', 'divRegion' 
            ]
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        if (!authLocal || window.location.href.includes('index.html')) return;

        let path = window.location.pathname;
        let paginaActual = path.split("/").pop() || "Inicio.html";

        let rol = authLocal.rol;
        let confRol = Permisos[rol] || { paginasBloqueadas: [], elementosOcultos: [] };
        
        let prohibidas = [...confRol.paginasBloqueadas];
        let ocultos = [...confRol.elementosOcultos];

        // 🔥 LA SOLUCIÓN: Usamos el "Nombre Completo" porque el login no guarda el usuario corto
        let nombreActivo = String(authLocal.nombre).trim().toLowerCase();

        // PERMISOS ESPECIALES PARA LEO
        if (nombreActivo.includes('leonardo flores')) {
            // Le agregamos Reportes.html a sus páginas habilitadas
            let paginasExtra = ['AuditoriaRutas.html', 'AuditorMasivo.html', 'Reportes.html'];
            // Le agregamos los botones/tarjetas de Reportes a sus elementos habilitados
            let elementosExtra = ['linkAuditoria', 'cardAuditoria', 'linkMasivo', 'cardMasivo', 'linkReportes', 'cardReportes'];
            
            prohibidas = prohibidas.filter(p => !paginasExtra.includes(p));
            ocultos = ocultos.filter(e => !elementosExtra.includes(e));
        }

        // A. BARRERA DE SEGURIDAD 
        if (prohibidas.includes(paginaActual)) {
            alert("⛔ Acceso denegado. Este módulo está restringido según tu nivel de acceso.");
            window.location.href = 'Inicio.html';
            return;
        }

        // B. OCULTAR ELEMENTOS VISUALES
        ocultos.forEach(idElemento => {
            let el = document.getElementById(idElemento);
            if (el) el.style.display = 'none';
        });
    });
})();

// C. AUTO-ILUMINAR EL BOTÓN DEL MENÚ ACTUAL
        let navLinks = document.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            if(link.getAttribute('href') === paginaActual) link.classList.add('active');
        });