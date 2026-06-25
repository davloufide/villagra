// Marca el enlace activo del menú según la página actual
document.addEventListener('DOMContentLoaded', () => {
  const pagina = window.location.pathname.split('/').pop();
  document.querySelectorAll('.menu a').forEach(a => {
    if (a.getAttribute('href') === pagina) a.classList.add('active');
  });
});

// NOTA: la lista de marcas se carga siempre desde la base de datos
// (endpoint /vehiculos/marcas/lista). No hay listas hardcodeadas para
// evitar duplicados e inconsistencias entre el código y la BD.
