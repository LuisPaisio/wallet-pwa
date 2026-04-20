document.addEventListener("DOMContentLoaded", () => {
  let request = indexedDB.open("walletDB", 1);

  request.onupgradeneeded = function(event) {
    let db = event.target.result;
    db.createObjectStore("movimientos", { keyPath: "id", autoIncrement: true });
    db.createObjectStore("metas", { keyPath: "id", autoIncrement: true });
  };

  let chartIngresosGastos, chartCategorias;
  let metasSeleccionada = null;

  // --- Funciones de gráficos Wallet ---
  function guardarMovimiento(tipo) {
    let desc = tipo === 'ingreso' ? document.getElementById('descIngreso').value : document.getElementById('descGasto').value;
    let monto = tipo === 'ingreso' ? document.getElementById('montoIngreso').value : document.getElementById('montoGasto').value;
    let etiqueta = tipo === 'ingreso' ? document.getElementById('etiquetaIngreso').value : document.getElementById('etiquetaGasto').value;

    let db = request.result;
    let tx = db.transaction("movimientos", "readwrite");
    let store = tx.objectStore("movimientos");
    store.add({ tipo, desc, monto: parseFloat(monto), etiqueta, fecha: new Date() });

    tx.oncomplete = () => {
      actualizarGraficos();
      cerrarModal("modal");
    };
  }

  function obtenerMovimientos(callback) {
    let db = request.result;
    let tx = db.transaction("movimientos", "readonly");
    let store = tx.objectStore("movimientos");
    let movimientos = [];
    store.openCursor().onsuccess = e => {
      let cursor = e.target.result;
      if (cursor) {
        movimientos.push(cursor.value);
        cursor.continue();
      } else {
        callback(movimientos);
      }
    };
  }

  function actualizarGraficos() {
    obtenerMovimientos(movimientos => {
      let totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((acc, m) => acc + m.monto, 0);
      let totalGastos = movimientos.filter(m => m.tipo === 'gasto').reduce((acc, m) => acc + m.monto, 0);

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
        }
      });

      let categorias = {};
      movimientos.filter(m => m.tipo === 'gasto').forEach(m => {
        categorias[m.etiqueta] = (categorias[m.etiqueta] || 0) + m.monto;
      });

      if (chartCategorias) chartCategorias.destroy();
      chartCategorias = new Chart(document.getElementById('graficoCategorias'), {
        type: 'doughnut',
        data: {
          labels: Object.keys(categorias),
          datasets: [{
            data: Object.values(categorias),
            backgroundColor: ['#facc15', '#06b6d4', '#9c27b0', '#60a5fa']
          }]
        }
      });
    });
  }

  // --- Funciones de metas ---
  function guardarMeta() {
    let desc = document.getElementById('descMeta').value;
    let monto = parseFloat(document.getElementById('montoMeta').value);

    let db = request.result;
    let tx = db.transaction("metas", "readwrite");
    let store = tx.objectStore("metas");
    store.add({ desc, meta: monto, ahorrado: 0 });

    tx.oncomplete = () => {
      cerrarModal("modalMeta");
      renderizarMetas();
    };
  }

  function renderizarMetas() {
    let db = request.result;
    let tx = db.transaction("metas", "readonly");
    let store = tx.objectStore("metas");
    let metas = [];
    store.openCursor().onsuccess = e => {
      let cursor = e.target.result;
      if (cursor) {
        metas.push(cursor.value);
        cursor.continue();
      } else {
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

          let progreso = (meta.ahorrado / meta.meta) * 100;
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
                ctx.font = "bold 18px Poppins";
                ctx.fillStyle = "#06b6d4";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(`$${meta.ahorrado}/${meta.meta}`, width / 2, height / 2);
              }
            }]
          });
        });

        document.querySelectorAll(".btn-sumar").forEach(btn => {
          btn.onclick = () => {
            metasSeleccionada = parseInt(btn.dataset.id);
            abrirModal("modalAhorro");
          };
        });
      }
    };
  }

  function sumarAhorroSeleccionada() {
    let monto = parseFloat(document.getElementById('montoAhorro').value);
    let db = request.result;
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
        meta.ahorrado += monto;
        if (meta.ahorrado > meta.meta) meta.ahorrado = meta.meta;
        store.put(meta);
        tx.oncomplete = () => {
          cerrarModal("modalAhorro");
          renderizarMetas();
        };
      }
    };
  }

  // --- Modal helpers ---
  function abrirModal(id) { document.getElementById(id).style.display = 'block'; }
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

  // Exponer funciones globales
  window.guardarMovimiento = guardarMovimiento;
  window.guardarMeta = guardarMeta;
  window.sumarAhorroSeleccionada = sumarAhorroSeleccionada;

  // Render inicial
  renderizarMetas();
  actualizarGraficos();
});
