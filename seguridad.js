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
