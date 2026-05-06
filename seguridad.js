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
    // Solo actuamos si el usuario tiene una sesión activa
    if(localStorage.getItem('sesionActiva')) {
        alert("⏱️ Por tu seguridad, la sesión ha expirado tras 10 minutos de inactividad.");
        localStorage.removeItem('sesionActiva');
        window.location.href = 'index.html'; // Lo mandamos de regreso al login
    }
}

function resetearTemporizador() {
    clearTimeout(tiempoInactividad);
    // 600000 milisegundos = 10 minutos exactos
    tiempoInactividad = setTimeout(cerrarSesionPorInactividad, 600000);
}

// Escuchamos cualquier acción del usuario para poner el reloj a cero
window.onload = resetearTemporizador;
document.onmousemove = resetearTemporizador;
document.onkeypress = resetearTemporizador;
document.onclick = resetearTemporizador;
document.onscroll = resetearTemporizador;

/* =========================================
   3. FIRMA DEL DESARROLLADOR (Marca de agua)
   ========================================= */
document.addEventListener('DOMContentLoaded', function() {
    // Creamos el texto
    const firma = document.createElement('div');
    firma.textContent = "Elaborado por: Hector Torres";
    
    // Le damos estilo (Esquina inferior izquierda, casi invisible)
    firma.style.position = 'fixed';
    firma.style.bottom = '10px';
    firma.style.left = '10px';
    firma.style.fontSize = '11px';
    firma.style.color = '#64748b'; // Color gris sutil
    firma.style.opacity = '0.3';   // 30% de visibilidad (Apenas visible)
    firma.style.zIndex = '9999';   // Para que siempre esté por encima del fondo
    firma.style.pointerEvents = 'none'; // Para que no estorbe si alguien hace clic ahí
    firma.style.fontFamily = 'Arial, sans-serif';
    firma.style.userSelect = 'none'; // Evita que la gente lo seleccione con el mouse
    
    // Lo pegamos en la pantalla
    document.body.appendChild(firma);
});