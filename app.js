// Inicializar IndexedDB
let request = indexedDB.open("walletDB", 1);

request.onupgradeneeded = function(event) {
  let db = event.target.result;
  db.createObjectStore("movimientos", { keyPath: "id", autoIncrement: true });
  db.createObjectStore("metas", { keyPath: "id", autoIncrement: true });
};

// Variables globales para gráficos (evitar duplicados)
let chartIngresosGastos, chartCategorias, chartAhorro;

// Guardar ingreso/gasto
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
    cerrarModal();
  };
}

// Leer movimientos
function obtenerMovimientos(callback) {
  let db = request.result;
  let tx = db.transaction("movimientos", "readonly");
  let store = tx.objectStore("movimientos");
  let movimientos = [];

  store.openCursor().onsuccess = function(event) {
    let cursor = event.target.result;
    if (cursor) {
      movimientos.push(cursor.value);
      cursor.continue();
    } else {
      callback(movimientos);
    }
  };
}

// Actualizar gráficos
function actualizarGraficos() {
  obtenerMovimientos(movimientos => {
    let totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((acc, m) => acc + m.monto, 0);
    let totalGastos = movimientos.filter(m => m.tipo === 'gasto').reduce((acc, m) => acc + m.monto, 0);

    // Evitar gráficos vacíos
    if (totalIngresos === 0 && totalGastos === 0) {
      totalIngresos = 0.01;
      totalGastos = 0.01;
    }

    let categorias = {};
    movimientos.filter(m => m.tipo === 'gasto').forEach(m => {
      categorias[m.etiqueta] = (categorias[m.etiqueta] || 0) + m.monto;
    });

    if (Object.keys(categorias).length === 0) {
      categorias = { "Sin datos": 0.01 };
    }

    // Gráfico ingresos vs gastos
    if (chartIngresosGastos) chartIngresosGastos.destroy();
    chartIngresosGastos = new Chart(document.getElementById('graficoIngresosGastos'), {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Gastos'],
        datasets: [{
          label: 'Totales',
          data: [totalIngresos, totalGastos],
          backgroundColor: ['#4CAF50', '#F44336']
        }]
      }
    });

    // Gráfico circular por categorías
    if (chartCategorias) chartCategorias.destroy();
    chartCategorias = new Chart(document.getElementById('graficoCategorias'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(categorias),
        datasets: [{
          data: Object.values(categorias),
          backgroundColor: ['#FF9800', '#2196F3', '#9C27B0', '#00BCD4']
        }]
      }
    });
  });
}

// Abrir/cerrar modal
document.getElementById('fab').onclick = () => {
  document.getElementById('modal').style.display = 'block';
};
function cerrarModal() {
  document.getElementById('modal').style.display = 'none';
}
document.querySelector(".close").onclick = cerrarModal;

// Tabs dentro del modal
document.querySelectorAll('.tabs a').forEach(tab => {
  tab.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.tabs a').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const target = document.querySelector(tab.getAttribute('href'));
    target.classList.add('active');
  });
});

// Tabs principales (Wallet / Metas)
document.querySelectorAll('.main-tabs a').forEach(tab => {
  tab.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.main-tabs a').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    const target = document.querySelector(tab.getAttribute('href'));
    target.classList.add('active');
  });
});

// Registrar Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
    .then(() => console.log("Service Worker registrado"))
    .catch(err => console.error("Error al registrar SW:", err));
}

// Guardar meta
function guardarMeta() {
  let desc = document.getElementById('descMeta').value;
  let monto = parseFloat(document.getElementById('montoMeta').value);

  let db = request.result;
  let tx = db.transaction("metas", "readwrite");
  let store = tx.objectStore("metas");
  store.add({ desc, meta: monto, ahorrado: 0 });

  tx.oncomplete = () => {
    actualizarGraficoAhorro();
  };
}

// Sumar ahorro
function sumarAhorro() {
  let id = parseInt(document.getElementById('idMeta').value);
  let monto = parseFloat(document.getElementById('montoAhorro').value);

  let db = request.result;
  let tx = db.transaction("metas", "readwrite");
  let store = tx.objectStore("metas");
  let req = store.get(id);

  req.onsuccess = () => {
    let meta = req.result;
    if (meta) {
      meta.ahorrado += monto;
      store.put(meta);
      tx.oncomplete = () => {
        actualizarGraficoAhorro();
      };
    } else {
      console.error("Meta no encontrada con ID:", id);
    }
  };
}

// Actualizar gráfico de ahorro
function actualizarGraficoAhorro() {
  let db = request.result;
  let tx = db.transaction("metas", "readonly");
  let store = tx.objectStore("metas");
  let metas = [];

  store.openCursor().onsuccess = function(event) {
    let cursor = event.target.result;
    if (cursor) {
      metas.push(cursor.value);
      cursor.continue();
    } else {
      if (metas.length > 0) {
        let meta = metas[0]; // por ahora mostramos la primera
        let progreso = (meta.ahorrado / meta.meta) * 100;

        if (chartAhorro) chartAhorro.destroy();
        chartAhorro = new Chart(document.getElementById('graficoAhorro'), {
          type: 'doughnut',
          data: {
            datasets: [{
              data: [progreso, 100 - progreso],
              backgroundColor: ['#4CAF50', '#e0e0e0']
            }]
          },
          options: {
            cutout: '80%',
            plugins: { legend: { display: false } }
          }
        });
      }
    }
  };
}
