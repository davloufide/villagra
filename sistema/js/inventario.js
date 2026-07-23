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

      // Lista de categorías existentes con opción de eliminar
      const lista = document.getElementById('cat-list');
      if (lista) {
        lista.innerHTML = cats.length
          ? cats.map(c => `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:5px 6px 5px 10px;">
                <span style="font-size:0.83rem;color:#334155;">${c.nombre}</span>
                <button type="button" class="btn btn-outline btn-sm" onclick="eliminarCategoria(${c.id_categoria}, '${(c.nombre || '').replace(/'/g, "\\'")}')" title="Eliminar categoría"><i class="fas fa-trash" style="color:#dc2626;"></i></button>
              </div>`).join('')
          : '<p style="font-size:0.8rem;color:#94a3b8;padding:2px 2px 0;">Aún no hay categorías.</p>';
      }
    } catch {}
  }

  // Eliminar una categoría (sus productos quedan "Sin categoría")
  window.eliminarCategoria = async (id, nombre) => {
    const n = todos.filter(p => p.id_categoria === id).length;
    const mensaje = n > 0
      ? `La categoría "${nombre}" tiene ${n} producto(s). Al eliminarla, esos productos quedarán como "Sin categoría". ¿Continuar?`
      : `¿Eliminar la categoría "${nombre}"?`;
    if (!(await confirmar({ titulo: 'Eliminar categoría', mensaje, confirmar: 'Eliminar' }))) return;
    try {
      const r = await inventario.eliminarCategoria(id);
      toast(`Categoría eliminada${r.productos_afectados ? ` · ${r.productos_afectados} producto(s) sin categoría` : ''}`);
      await cargarCategorias();
      await cargarProductos();  // refresca la tabla (los nombres de categoría cambian)
    } catch (e) {
      toast(e.message, 'error');
    }
  };

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

  // Ir al submódulo "Ajustar stock" y llenar el selector con los productos actuales
  window.irAjustarStock = () => {
    const sel = document.getElementById('stock-producto');
    sel.innerHTML = '<option value="">-- Seleccionar producto --</option>' +
      todos.map(p => `<option value="${p.id_producto}">${p.nombre} (${p.codigo}) · ${p.cantidad_stock} uds.</option>`).join('');
    document.getElementById('stock-cantidad').value = '';
    document.getElementById('stock-actual').value   = '';
    mostrarVista('stock');
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
      mostrarVista('lista');
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
      mostrarVista('lista');
      await cargarProductos();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  // Exportar reporte de inventario a PDF (IVO-012)
  // Respeta el filtro de búsqueda activo: exporta lo que se está viendo.
  window.exportarInventarioPDF = () => {
    const money = n => '₡' + Number(n || 0).toLocaleString('es');
    const q = (document.getElementById('inv-buscar')?.value ?? '').toLowerCase();
    const lista = q
      ? todos.filter(p =>
          (p.nombre ?? '').toLowerCase().includes(q) ||
          (p.codigo ?? '').toLowerCase().includes(q) ||
          (p.marca ?? '').toLowerCase().includes(q))
      : todos;

    if (!lista.length) { toast('No hay productos para exportar', 'error'); return; }

    const bajos = lista.filter(p => p.cantidad_stock < p.stock_minimo);
    const valorTotal = lista.reduce((s, p) => s + (p.cantidad_stock * Number(p.costo_unitario ?? 0)), 0);
    const etiqueta = { danger: 'Crítico', warning: 'Bajo', success: 'OK' };

    const filas = lista.map(p => {
      const nv = nivelStock(p);
      const valor = p.cantidad_stock * Number(p.costo_unitario ?? 0);
      return `
        <tr>
          <td><strong>${p.nombre}</strong></td>
          <td>${p.codigo ?? '-'}</td>
          <td>${p.categorias?.nombre ?? '-'}</td>
          <td>${p.marca ?? '-'}</td>
          <td style="text-align:center;">${p.cantidad_stock}</td>
          <td style="text-align:center;">${p.stock_minimo ?? '-'}</td>
          <td style="text-align:center;"><span class="badge ${nv}">${etiqueta[nv]}</span></td>
          <td style="text-align:right;">${money(p.costo_unitario)}</td>
          <td style="text-align:right;">${money(valor)}</td>
        </tr>`;
    }).join('');

    const seccionBajos = bajos.length ? `
      <div class="alerta">
        <strong>⚠ ${bajos.length} producto(s) por debajo del stock mínimo:</strong>
        ${bajos.map(p => `${p.nombre} (${p.cantidad_stock}/${p.stock_minimo})`).join(' · ')}
      </div>` : '';

    const html = `
      <html><head><meta charset="utf-8"><title>Reporte de inventario</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:900px;margin:26px auto;padding:0 20px;}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:18px;}
        .brand{font-size:1.3rem;font-weight:800;color:#1e3a8a;}
        .muted{color:#64748b;font-size:0.85rem;}
        .kpis{display:flex;gap:12px;margin-bottom:16px;}
        .kpi{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;}
        .kpi .lbl{color:#64748b;font-size:0.78rem;text-transform:uppercase;letter-spacing:.4px;}
        .kpi .val{font-size:1.35rem;font-weight:800;margin-top:3px;}
        .alerta{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:9px;padding:10px 13px;font-size:0.84rem;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;margin-top:6px;}
        th,td{padding:8px 9px;border-bottom:1px solid #e2e8f0;font-size:0.83rem;}
        th{background:#f8fafc;text-align:left;color:#475569;}
        .badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:0.72rem;font-weight:700;}
        .badge.danger{background:#fee2e2;color:#b91c1c;}
        .badge.warning{background:#fef3c7;color:#92400e;}
        .badge.success{background:#dcfce7;color:#166534;}
        tfoot td{font-weight:800;border-top:2px solid #0f172a;font-size:0.9rem;}
        @media print{.badge{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style></head>
      <body>
        <div class="head">
          <div>
            <div class="brand">Lubricentro Villagra</div>
            <div class="muted">Moravia, San Vicente, San José, Costa Rica<br>Tel. 8413-2121 · lubricentrovillagra@gmail.com</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.35rem;font-weight:900;">REPORTE DE INVENTARIO</div>
            <div class="muted">Generado: ${new Date().toLocaleString('es-CR')}</div>
            ${q ? `<div class="muted">Filtro aplicado: "${q}"</div>` : ''}
          </div>
        </div>

        <div class="kpis">
          <div class="kpi"><div class="lbl">Total productos</div><div class="val">${lista.length}</div></div>
          <div class="kpi"><div class="lbl">Con stock crítico</div><div class="val" style="color:#dc2626;">${bajos.length}</div></div>
          <div class="kpi"><div class="lbl">Valor en stock</div><div class="val">${money(valorTotal)}</div></div>
        </div>

        ${seccionBajos}

        <table>
          <thead><tr>
            <th>Producto</th><th>Código</th><th>Categoría</th><th>Marca</th>
            <th style="text-align:center;">Stock</th><th style="text-align:center;">Mín.</th>
            <th style="text-align:center;">Estado</th><th style="text-align:right;">Costo unit.</th><th style="text-align:right;">Valor</th>
          </tr></thead>
          <tbody>${filas}</tbody>
          <tfoot><tr><td colspan="8" style="text-align:right;">VALOR TOTAL DEL INVENTARIO</td><td style="text-align:right;">${money(valorTotal)}</td></tr></tfoot>
        </table>

        <p style="text-align:center;color:#94a3b8;font-size:0.8rem;margin-top:26px;">Reporte generado por Auto Service Pro · Lubricentro Villagra</p>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { toast('Permite las ventanas emergentes para exportar el PDF', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

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
      mostrarVista('lista');
      await cargarProductos();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btnLoading(btn, false);
    }
  });

  await Promise.all([cargarProductos(), cargarCategorias()]);
});
