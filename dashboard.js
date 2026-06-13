/**
 * Módulo Dashboard - Panel principal con estadísticas y gráficas (Versión Supabase)
 */
const DashboardModule = {
  // Renderiza la estructura base de forma síncrona para evitar romper el flujo del contenedor principal
  render() {
    return `
      <div class="dashboard-stats" id="dashboardStatsContainer">
        <div class="text-center p-3" style="grid-column: 1 / -1;">⏳ Cargando indicadores...</div>
      </div>

      <div id="dashboardAlertsContainer"></div>

      <div class="dashboard-charts">
        <div class="card">
          <div class="card-header"><h3>📈 Días Solicitados por Mes</h3></div>
          <div class="card-body"><div class="chart-container"><canvas id="chartByMonth"></canvas></div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>📊 Tipos de Solicitudes</h3></div>
          <div class="card-body"><div class="chart-container"><canvas id="chartByType"></canvas></div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>👤 Trabajadores con Más Días</h3></div>
          <div class="card-body"><div class="chart-container"><canvas id="chartByWorker"></canvas></div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>📋 Estatus de Solicitudes</h3></div>
          <div class="card-body"><div class="chart-container"><canvas id="chartByStatus"></canvas></div></div>
        </div>
      </div>
    `;
  },

  // Punto de entrada asíncrono que realiza la carga de datos y distribuye las vistas
  async init() {
    try {
      // 1. Descarga paralela de colecciones desde Supabase
      const [workers, rawRequests] = await Promise.all([
        SupabaseClient.getWorkers(),
        SupabaseClient.getRequests()
      ]);

      // 2. Normalización de datos para compatibilidad
      const normalizedRequests = rawRequests.map(r => ({
        id: r.id,
        workerId: r.worker_id || r.workerId,
        workerName: r.worker_name || r.workerName,
        type: r.type,
        status: r.status,
        startDate: r.start_date || r.startDate,
        endDate: r.end_date || r.endDate,
        days: parseInt(r.days) || 0
      }));

      // 3. Procesar y renderizar componentes métricos y gráficos
      this.calculateStats(workers, normalizedRequests);
      this.renderAlerts(); 
      this.renderCharts(normalizedRequests);

    } catch (err) {
      console.error("Error al inicializar el Módulo Dashboard:", err);
      const statsContainer = document.getElementById('dashboardStatsContainer');
      if (statsContainer) {
        statsContainer.innerHTML = `<div class="text-error" style="grid-column: 1 / -1;">Error al conectar con el servidor de Supabase</div>`;
      }
    }
  },

  // Calcula las métricas e inyecta el HTML en las tarjetas del panel principal
  calculateStats(workers, requests) {
    const year = CONFIG.CURRENT_YEAR;
    const activeWorkers = workers.filter(w => w.active ?? true);
    const inactiveWorkersCount = workers.filter(w => w.active === false).length;

    // Filtrar solicitudes del año actual
    const yearRequests = requests.filter(r => {
      if (!r.startDate) return false;
      return new Date(r.startDate).getFullYear() === year;
    });

    // Cálculos métricos basados en reglas de negocio
    const economicUsed = yearRequests
      .filter(r => r.type === 'economico' && r.status === 'autorizado')
      .reduce((s, r) => s + r.days, 0);

    const pendingVacations = yearRequests.filter(r => r.type === 'vacaciones' && r.status === 'pendiente').length;

    const today = new Date().toISOString().split('T')[0];
    const activeIncap = requests.filter(r =>
      ['incapacidad', 'incapacidad_riesgo'].includes(r.type) &&
      r.status === 'autorizado' && r.startDate <= today && r.endDate >= today
    ).length;

    const pendingChanges = requests.filter(r => r.type === 'cambio_dia' && r.status === 'pendiente').length;
    
    // Fallback seguro en caso de que Validators no esté asincronizado o disponible
    const totalAlertsCount = (window.App && window.App.alerts) ? window.App.alerts.length : 0;

    const container = document.getElementById('dashboardStatsContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon orange">👥</div>
        <div class="stat-content">
          <h4>Total Trabajadores</h4>
          <div class="stat-value">${activeWorkers.length}</div>
          <div class="stat-sub">${inactiveWorkersCount} inactivos</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon turquoise">💰</div>
        <div class="stat-content">
          <h4>Días Económicos Usados</h4>
          <div class="stat-value">${economicUsed}</div>
          <div class="stat-sub">Año ${year}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon yellow">🏖️</div>
        <div class="stat-content">
          <h4>Vacaciones Pendientes</h4>
          <div class="stat-value">${pendingVacations}</div>
          <div class="stat-sub">Por autorizar</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">🏥</div>
        <div class="stat-content">
          <h4>Incapacidades Activas</h4>
          <div class="stat-value">${activeIncap}</div>
          <div class="stat-sub">En curso</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon teal">🔄</div>
        <div class="stat-content">
          <h4>Cambios Pendientes</h4>
          <div class="stat-value">${pendingChanges}</div>
          <div class="stat-sub">Por autorizar</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">🔔</div>
        <div class="stat-content">
          <h4>Alertas</h4>
          <div class="stat-value">${totalAlertsCount}</div>
          <div class="stat-sub">Requieren atención</div>
        </div>
      </div>
    `;
  },

  // Extrae y pinta el panel de alertas si el validador global generó incidencias
  renderAlerts() {
    const container = document.getElementById('dashboardAlertsContainer');
    if (!container) return;

    const alerts = (window.App && window.App.alerts) ? window.App.alerts : [];
    if (alerts.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="card dashboard-alerts-panel">
        <div class="card-header"><h3>⚠️ Alertas Importantes</h3></div>
        <div class="card-body">
          ${alerts.slice(0, 5).map(a => `
            <div class="alert alert-${a.type}">
              <span class="alert-icon">${a.icon}</span>
              <span>${Utils.escapeHtml(a.message)}</span>
            </div>
          `).join('')}
          ${alerts.length > 5 ? `<p class="text-muted text-center mt-2">Y ${alerts.length - 5} alerta(s) más...</p>` : ''}
        </div>
      </div>
    `;
  },

  // Inicializa las instancias de Chart.js con los arreglos normalizados
  renderCharts(requests) {
    // Filtro inicial para las gráficas: Año en curso y solicitudes válidas
    const validRequests = requests.filter(r =>
      r.startDate &&
      new Date(r.startDate).getFullYear() === CONFIG.CURRENT_YEAR &&
      !['rechazado', 'cancelado'].includes(r.status)
    );

    // Destruir instancias previas de gráficas si existen para evitar fugas de memoria o solapamiento
    if (window.App && window.App.charts) {
      if (window.App.charts.byMonth) window.App.charts.byMonth.destroy();
      if (window.App.charts.byType) window.App.charts.byType.destroy();
      if (window.App.charts.byWorker) window.App.charts.byWorker.destroy();
      if (window.App.charts.byStatus) window.App.charts.byStatus.destroy();
    } else {
      if (!window.App) window.App = {};
      window.App.charts = {};
    }

    // --- 1. Gráfica por mes ---
    const monthData = Array(12).fill(0);
    validRequests.forEach(r => {
      const month = new Date(r.startDate).getMonth();
      monthData[month] += r.days;
    });

    window.App.charts.byMonth = new Chart(document.getElementById('chartByMonth'), {
      type: 'bar',
      data: {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
        datasets: [{
          label: 'Días solicitados',
          data: monthData,
          backgroundColor: 'rgba(252, 113, 43, 0.7)',
          borderColor: '#FC712B',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // --- 2. Gráfica por tipo ---
    const typeCounts = {};
    Object.keys(CONFIG.REQUEST_TYPES).forEach(t => typeCounts[t] = 0);
    validRequests.forEach(r => { 
      if (typeCounts[r.type] !== undefined) {
        typeCounts[r.type]++; 
      }
    });

    window.App.charts.byType = new Chart(document.getElementById('chartByType'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(typeCounts).map(t => CONFIG.REQUEST_TYPES[t]?.label || t),
        datasets: [{
          data: Object.values(typeCounts),
          backgroundColor: Object.keys(typeCounts).map(t => CONFIG.REQUEST_TYPES[t]?.color || '#ccc')
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    // --- 3. Gráfica por trabajador ---
    const workerDays = {};
    validRequests.forEach(r => {
      if (r.workerName) {
        workerDays[r.workerName] = (workerDays[r.workerName] || 0) + r.days;
      }
    });
    const sortedWorkers = Object.entries(workerDays).sort((a, b) => b[1] - a[1]).slice(0, 5);

    window.App.charts.byWorker = new Chart(document.getElementById('chartByWorker'), {
      type: 'bar',
      data: {
        labels: sortedWorkers.map(w => w[0].split(' ').slice(0, 2).join(' ')),
        datasets: [{
          label: 'Días',
          data: sortedWorkers.map(w => w[1]),
          backgroundColor: 'rgba(7, 177, 188, 0.7)',
          borderColor: '#07B1BC',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    // --- 4. Gráfica por estatus (incluye cancelados/rechazados) ---
    const statusCounts = {};
    requests.forEach(r => {
      if (r.status) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      }
    });

    window.App.charts.byStatus = new Chart(document.getElementById('chartByStatus'), {
      type: 'pie',
      data: {
        labels: Object.keys(statusCounts).map(s => CONFIG.STATUS[s]?.label || s),
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: ['#FD9319', '#27ae60', '#e74c3c', '#95a5a6']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
};