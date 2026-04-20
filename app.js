document.addEventListener("DOMContentLoaded", () => {
  let db;
  let chartIngresosGastos, chartCategorias;
  let metasSeleccionada = null;

  let request = indexedDB.open("walletDB", 1);

  request.onupgradeneeded = function(event) {
    db = event.target.result;
    db.createObjectStore("movimientos", { keyPath: "id", autoIncrement: true });
    db.createObjectStore("metas", { keyPath: "id", autoIncrement: true });
  };

  request.onsuccess = function(event) {
    db = event.target.result;
    refrescarDatos(); // carga inicial tabla + gráficos + metas
  };

  request.onerror = function(event) {
    console.error("Error al abrir IndexedDB:", event.target.errorCode);
  };

  // --- Función central ---
  function refrescarDatos(limit = 5) {
    // Movimientos
    let txMov = db.transaction("movimientos", "readonly");
    let storeMov = txMov.objectStore("movimientos");
    let movimientos = [];

    storeMov.openCursor().onsuccess = e => {
      let cursor = e.target.result;
      if (cursor) {
        movimientos.push(cursor.value);
        cursor.continue();
      }
    };

    txMov.oncomplete = () => {
      renderizarMovimientos(movimientos, limit);
      actualizarGraficos(movimientos);
    };

    // Metas
    let txMetas = db.transaction("metas", "readonly");
    let storeMetas = txMetas.objectStore("metas");
    let metas = [];

    storeMetas.openCursor().onsuccess = e => {
      let cursor = e.target.result;
      if (cursor) {
        let value = cursor.value;
        // Asegurar que cada meta tenga su id
        value.id = cursor.primaryKey;
        metas.push(value);
        cursor.continue();
      }
    };

    txMetas.oncomplete = () => {
      setTimeout(() => renderizarMetas(metas), 0);
    };
  }

  // --- Guardar ingreso/gasto ---
  function guardarMovimiento(tipo) {
    let desc = tipo === 'ingreso' ? document.getElementById('descIngreso').value : document.getElementById('descGasto').value;
    let monto = tipo === 'ingreso' ? document.getElementById('montoIngreso').value : document.getElementById('montoGasto').value;
    let etiqueta = tipo === 'ingreso' ? document.getElementById('etiquetaIngreso').value : document.getElementById('etiquetaGasto').value;

    let tx = db.transaction("movimientos", "readwrite");
    let store = tx.objectStore("movimientos");
    store.add({ tipo, desc, monto: parseFloat(monto), etiqueta, fecha: new Date() });

    tx.oncomplete = () => {
      refrescarDatos();
      cerrarModal("modal");
    };
  }

  // --- Guardar meta ---
  function guardarMeta() {
    let desc = document.getElementById('descMeta').value;
    let monto = parseFloat(document.getElementById('montoMeta').value);

    let tx = db.transaction("metas", "readwrite");
    let store = tx.objectStore("metas");
    store.add({ desc, meta: monto, ahorrado: 0 });

    tx.oncomplete = () => {
      refrescarDatos();
      cerrarModal("modalMeta");
    };
  }

  // --- Sumar ahorro ---
  function sumarAhorroSeleccionada() {
    let monto = parseFloat(document.getElementById('montoAhorro').value);

    let tx = db.transaction("metas", "readwrite");
    let store = tx.objectStore("metas");
    let req = store.get(metasSeleccionada);

    req.onsuccess = () => {
      let meta = req.result;
      if (meta) {
        if (meta.ahorrado >= meta.meta) {
          alert("Meta completada, no puedes sumar más ahorro.");
          return;
        }

        if (meta.ahorrado + monto > meta.meta) {
          let confirmar = confirm(
            `Estás intentando sumar $${monto}, pero tu meta es de $${meta.meta}. 
Esto superará la meta en $${(meta.ahorrado + monto) - meta.meta}. 
¿Quieres agregarlo igualmente?`
          );
          if (!confirmar) return;
        }

        meta.ahorrado += monto;
        store.put(meta);

        tx.oncomplete = () => {
          refrescarDatos();
          cerrarModal("modalAhorro");
        };
      }
    };
  }

  // --- Renderizar tabla ---
  function renderizarMovimientos(movimientos, limit = 5) {
    const body = document.getElementById("movimientosBody");
    const mensaje = document.getElementById("mensajeMovimientos");

    if (movimientos.length === 0) {
      mensaje.style.display = "block";
      body.innerHTML = "";
      return;
    } else {
      mensaje.style.display = "none";
    }

    movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    let mostrar = movimientos.slice(0, limit);

    body.innerHTML = "";
    mostrar.forEach(m => {
      let fila = document.createElement("tr");
      fila.innerHTML = `
        <td>${new Date(m.fecha).toLocaleDateString()}</td>
        <td>${m.tipo}</td>
        <td>${m.desc}</td>
        <td>$${m.monto}</td>
        <td>${m.etiqueta}</td>
      `;
      body.appendChild(fila);
    });
  }

  // --- Renderizar gráficos ---
  function actualizarGraficos(movimientos) {
    if (movimientos.length === 0) {
      document.getElementById('mensajeIngresosGastos').style.display = 'block';
      document.getElementById('mensajeCategorias').style.display = 'block';
    } else {
      document.getElementById('mensajeIngresosGastos').style.display = 'none';
      document.getElementById('mensajeCategorias').style.display = 'none';
    }

    let totalIngresos = movimientos.filter(m => m.tipo === 'ingreso')
                                  .reduce((acc, m) => acc + m.monto, 0);
    let totalGastos = movimientos.filter(m => m.tipo === 'gasto')
                                .reduce((acc, m) => acc + m.monto, 0);

    if (chartIngresosGastos) chartIngresosGastos.destroy();
    chartIngresosGastos = new Chart(document.getElementById('graficoIngresosGastos'), {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Gastos'],
        datasets: [{
          label: 'Totales',
          data: [totalIngresos, totalGastos],
          backgroundColor: ['#3b82f6', '#f87171']
        }]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Ingresos vs Gastos',
            font: {
              size: 18,
              family: getComputedStyle(document.body).fontFamily,
              weight: 'bold'
            },
            color: '#06b6d4'
          },
          legend: { display: false }
        }
      }
    });

    let categorias = {};
    movimientos.filter(m => m.tipo === 'gasto').forEach(m => {
      categorias[m.etiqueta] = (categorias[m.etiqueta] || 0) + m.monto;
    });

    if (chartCategorias) chartCategorias.destroy();
    let totalGastosCategorias = Object.values(categorias).reduce((acc, val) => acc + val, 0);

    chartCategorias = new Chart(document.getElementById('graficoCategorias'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(categorias),
        datasets: [{
          data: Object.values(categorias),
          backgroundColor: ['#facc15', '#06b6d4', '#9c27b0', '#60a5fa']
        }]
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: 'Gastos por Categoría',
            font: {
              size: 18,
              family: getComputedStyle(document.body).fontFamily,
              weight: 'bold'
            },
            color: '#06b6d4'
          },
          legend: { position: 'bottom' }
        }
      }
    });
  }

  // --- Renderizar metas ---
  function renderizarMetas(metas) {
    const lista = document.getElementById("listaMetas");
    lista.innerHTML = "";

    metas.forEach(meta => {
      const card = document.createElement("div");
      card.className = "meta-card";
      card.innerHTML = `
        <h3>${meta.desc}</h3>
        <canvas id="meta-${meta.id}" width="200" height="200"></canvas>
        <button class="btn-sumar" data-id="${meta.id}">Sumar ahorro</button>
      `;
      lista.appendChild(card);

      let ahorrado = meta.ahorrado || 0;
      let objetivo = meta.meta || 1; // evitar división por 0
      let progreso = (ahorrado / objetivo) * 100;
      if (progreso < 0) progreso = 0;
      if (progreso > 100) progreso = 100;

      new Chart(document.getElementById(`meta-${meta.id}`), {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [progreso, 100 - progreso],
            backgroundColor: ['#3b82f6', '#334155']
          }]
        },
        options: {
          cutout: '80%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        },
        plugins: [{
          id: 'centerText',
          beforeDraw: chart => {
            let { ctx, chartArea: { width, height } } = chart;
            ctx.save();
            ctx.font = `bold 16px ${getComputedStyle(document.body).fontFamily}`;
            ctx.fillStyle = "#06b6d4";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`$${ahorrado}/${objetivo}`, width / 2, height / 2);
          }
        }]
      });
    });

    // Botones para sumar ahorro
    document.querySelectorAll(".btn-sumar").forEach(btn => {
      btn.onclick = () => {
        metasSeleccionada = parseInt(btn.dataset.id);
        abrirModal("modalAhorro");
      };
    });
  }


  function sumarAhorroSeleccionada() {
    let monto = parseFloat(document.getElementById('montoAhorro').value);

    let tx = db.transaction("metas", "readwrite");
    let store = tx.objectStore("metas");
    let req = store.get(metasSeleccionada);

    req.onsuccess = () => {
      let meta = req.result;
      if (meta) {
        if (meta.ahorrado >= meta.meta) {
          alert("Meta completada, no puedes sumar más ahorro.");
          return;
        }

        // Si el monto supera lo que falta para la meta
        if (meta.ahorrado + monto > meta.meta) {
          let confirmar = confirm(
            `Estás intentando sumar $${monto}, pero tu meta es de $${meta.meta}. 
  Esto superará la meta en $${(meta.ahorrado + monto) - meta.meta}. 
  ¿Quieres agregarlo igualmente?`
          );
          if (!confirmar) return;
        }

        meta.ahorrado += monto;
        store.put(meta);

        tx.oncomplete = () => {
          refrescarDatos();          // refresca tabla + gráficos + metas
          cerrarModal("modalAhorro");
        };
      }
    };
  }

  // --- Modal helpers ---
  function abrirModal(id) {
    document.getElementById(id).style.display = 'block';
    if (id === "modal") {
      // Reinicia el estado de tabs al abrir
      document.querySelectorAll('.tabs a').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tabs a[href="#ingreso"]').classList.add('active');
      document.getElementById('ingreso').classList.add('active');
    }
  }
  function cerrarModal(id) { document.getElementById(id).style.display = 'none'; }
  document.querySelectorAll(".close").forEach(btn => {
    btn.onclick = () => btn.closest(".modal").style.display = "none";
  });

  // --- FAB dinámico según tab activo ---
  document.getElementById('fab').onclick = () => {
    if (document.querySelector('.main-tabs a.active').getAttribute('href') === '#wallet') {
      abrirModal("modal");       // Modal de ingresos/gastos
    } else {
      abrirModal("modalMeta");   // Modal de metas
    }
  };

  // --- Tabs dentro del modal ingresos/gastos ---
  document.querySelectorAll('.tabs a').forEach(tab => {
    tab.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.tabs a').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector(tab.getAttribute('href')).classList.add('active');
    });
  });

  // --- Tabs principales ---
  document.querySelectorAll('.main-tabs a').forEach(tab => {
    tab.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.main-tabs a').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
      document.querySelector(tab.getAttribute('href')).classList.add('active');
    });
  });

  // --- Service Worker ---
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
      .then(() => console.log("Service Worker registrado"))
      .catch(err => console.error("Error al registrar SW:", err));
  }

  document.getElementById("verMas").onclick = () => {
    refrescarDatos(100); // muestra más movimientos y refresca todo
  };

  // Exponer funciones globales
  window.guardarMovimiento = guardarMovimiento;
  window.guardarMeta = guardarMeta;
  window.sumarAhorroSeleccionada = sumarAhorroSeleccionada;

  // Render inicial unificado
  refrescarDatos();
  });

