const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwAQMdYWwpPYHcZKVXygyok7TTcsDzKHnmsfdW5mPNSUZ0X6ecBujd8O5N8U82P2PS0Xg/exec";

// Al cargar cualquier página, si el usuario hace clic en un enlace del menú, limpiamos la memoria
document.querySelectorAll('.navbar a, .menu-link').forEach(enlace => {
  enlace.addEventListener('click', () => {
    sessionStorage.clear();
  });
});