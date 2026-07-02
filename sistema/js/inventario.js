document.addEventListener('DOMContentLoaded', async () => {
  const _rol = iniciarLayout(['administrador']);
  if (!_rol) return;

  let todos = [];

  function nivelStock(p) {
    if (p.cantidad_stock < p.stock_minimo) return 'danger';
    if (p.cantidad_stock <= p.stock_minimo + 2) return 'warning';
    return 'success';
  }

  function renderTabla(lista) {
    const tbody = document.getElementById('inv-tbody');
    tbody.innerHTML = lista.length
      ? lista.map(p => `
          <tr>
            <td><strong>${p.nombre}</strong><br><small style="color:#94a3b8;">${p.categorias?.nombre ?? ''}</small></td>
            <td>${p.codigo}</td>
            <td>${p.marca ?? '-'}</td>
            <td><span class="tag ${nivelStock(p)}">${p.cantidad_stock} uds.</span></td>
            <td>₡${Number(p.costo_unitario ?? 0).toLocaleString('es')}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Sin productos</td></tr>';
  }

  async function cargarProductos() {
    try {
      todos = await inventario.lista();
      renderTabla(todos);

      const bajos = todos.filter(p => p.cantidad_stock < p.stock_minimo);
      const valor = todos.reduce((s, p) => s + (p.cantidad_stock * Number(p.costo_unitario ?? 0)), 0);

      document.getElementById('inv-total').textContent   = todos.length;
      document.getElementById('inv-alertas').textContent = bajos.length;
      document.getElementById('inv-valor').textContent   = '₡' + valor.toLocaleString('es');

      const banner = document.getElementById('inv-alerta-banner');
      if (bajos.length) {
        banner.style.display = 'flex';
        document.getElementById('inv-alerta-texto').innerHTML =
          `<strong>${bajos.length} producto(s) con stock crítico:</strong> ${bajos.map(p => p.nombre).join(', ')}.`;
      } else {
        banner.style.display = 'none';
      }
    } catch (e) {
      toast('Error cargando inventario: ' + e.message, 'error');
    }
  }

  window.filtrarProductos = (q) => {
    const l = q.toLowerCase();
    renderTabla(todos.filter(p =>
      (p.nombre ?? '').toLowerCase().includes(l) ||
      (p.codigo ?? '').toLowerCase().includes(l) ||
      (p.marca ?? '').toLowerCase().includes(l)
    ));
  };

  async function cargarCategorias(seleccionar) {
    try {
      const cats = await inventario.categorias();
      const sel = document.getElementById('inv-categoria');
      sel.innerHTML = '<option value="">Seleccionar</option>' +
        cats.map(c => `<option value="${c.id_categoria}">${c.nombre}</option>`).join('');
      if (seleccionar) sel.value = seleccionar;
    } catch {}
  }

  // Crear categoría nueva (IVO-006)
  window.toggleNuevaCat = () => {
    const w = document.getElementById('nueva-cat-wrap');
    w.style.display = w.style.display === 'none' ? 'flex' : 'none';
    if (w.style.display === 'flex') document.getElementById('nueva-cat-nombre').focus();
  };

  document.getElementById('btn-crear-cat').addEventListener('click', async () => {
    const btn = document.getElementById('btn-crear-cat');
    const nombre = document.getElementById('nueva-cat-nombre').value.trim();
    if (!nombre) { toast('Escribe el nombre de la categoría', 'error'); return; }
    btnLoading(btn, true);
    try {
      const cat = await inventario.crearCategoria(nombre);
      toast('Categoría creada: ' + cat.nombre);
      document.getElementById('nueva-cat-nombre').value = '';
      document.getElementById('nueva-cat-wrap').style.display = 'none';
      await cargarCategorias(cat.id_categoria); // recarga y deja seleccionada la nueva
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  window.toggleFormProd = () => {
    document.getElementById('form-stock').style.display = 'none';
    const f = document.getElementById('form-producto');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  };

  window.toggleFormStock = () => {
    document.getElementById('form-producto').style.display = 'none';
    const f = document.getElementById('form-stock');
    const abrir = f.style.display === 'none';
    f.style.display = abrir ? 'block' : 'none';
    if (abrir) {
      // Llenar el selector con los productos actuales
      const sel = document.getElementById('stock-producto');
      sel.innerHTML = '<option value="">-- Seleccionar producto --</option>' +
        todos.map(p => `<option value="${p.id_producto}">${p.nombre} (${p.codigo}) · ${p.cantidad_stock} uds.</option>`).join('');
      document.getElementById('stock-cantidad').value = '';
      document.getElementById('stock-actual').value   = '';
    }
  };

  // Mostrar el stock actual del producto seleccionado
  document.getElementById('stock-producto').addEventListener('change', (e) => {
    const p = todos.find(x => x.id_producto === parseInt(e.target.value));
    document.getElementById('stock-actual').value = p ? `${p.cantidad_stock} uds.` : '';
  });

  // Ajustar stock: sirve para aumentar (entrada) y disminuir (salida) [IVO-003]
  async function ajustarStock(tipo) {
    const btn      = document.getElementById(tipo === 'entrada' ? 'btn-aumentar-stock' : 'btn-disminuir-stock');
    const idProd   = parseInt(document.getElementById('stock-producto').value);
    const cantidad = parseInt(document.getElementById('stock-cantidad').value);
    if (!idProd) { toast('Selecciona un producto', 'error'); return; }
    if (!cantidad || cantidad <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }

    btnLoading(btn, true);
    try {
      const actualizado = tipo === 'entrada'
        ? await inventario.entrada(idProd, cantidad)
        : await inventario.salida(idProd, cantidad);
      toast(`Stock actualizado: ahora hay ${actualizado.cantidad_stock} uds.`);
      document.getElementById('form-stock').style.display = 'none';
      await cargarProductos();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  }

  document.getElementById('btn-aumentar-stock').addEventListener('click', () => ajustarStock('entrada'));
  document.getElementById('btn-disminuir-stock').addEventListener('click', () => ajustarStock('salida'));

  // Corregir a valor exacto (IVO-010)
  document.getElementById('btn-corregir-stock').addEventListener('click', async () => {
    const btn      = document.getElementById('btn-corregir-stock');
    const idProd   = parseInt(document.getElementById('stock-producto').value);
    const cantidad = parseInt(document.getElementById('stock-cantidad').value);
    if (!idProd) { toast('Selecciona un producto', 'error'); return; }
    if (isNaN(cantidad) || cantidad < 0) { toast('Ingresa el valor exacto (0 o mayor)', 'error'); return; }

    btnLoading(btn, true);
    try {
      const actualizado = await inventario.ajuste(idProd, cantidad);
      toast(`Stock corregido: ahora hay ${actualizado.cantidad_stock} uds.`);
      document.getElementById('form-stock').style.display = 'none';
      await cargarProductos();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  document.getElementById('btn-guardar-producto').addEventListener('click', async () => {
    const btn    = document.getElementById('btn-guardar-producto');
    const nombre = document.getElementById('inv-nombre').value.trim();
    const codigo = document.getElementById('inv-codigo').value.trim();
    const marca  = document.getElementById('inv-marca').value.trim();
    const id_cat = document.getElementById('inv-categoria').value;
    const stock  = parseInt(document.getElementById('inv-stock').value) || 0;
    const minimo = parseInt(document.getElementById('inv-minimo').value) || 5;
    const costo  = parseFloat(document.getElementById('inv-costo').value.replace(/[^\d.]/g, '')) || 0;
    const precio = parseFloat(document.getElementById('inv-precio').value.replace(/[^\d.]/g, '')) || 0;

    if (!nombre || !codigo) { toast('Nombre y código son requeridos', 'error'); return; }

    btnLoading(btn, true);
    try {
      await inventario.crear({
        nombre, codigo, marca: marca || null, id_categoria: id_cat || null,
        cantidad_stock: stock, stock_minimo: minimo, costo_unitario: costo, precio_venta: precio
      });
      toast('Producto guardado correctamente');
      ['inv-nombre','inv-codigo','inv-marca','inv-stock','inv-minimo','inv-costo','inv-precio'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      document.getElementById('form-producto').style.display = 'none';
      await cargarProductos();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  await Promise.all([cargarProductos(), cargarCategorias()]);
});
