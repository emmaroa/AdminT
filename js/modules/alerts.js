/**
 * Módulo Alertas - Notificaciones y avisos del sistema (Versión Supabase)
 */
const AlertsModule = {
  // Renderizado síncrono inicial del esqueleto visual
  render() {
    return `
      <div id="alertsStatsContainer">
        <div class="dashboard-stats mb-3">
          <div class="text-center p-3" style="grid-column: 1 / -1;">⏳ Cargando indicadores de alertas...</div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header"><h3>🔔 Alertas del Sistema</h3></div>
        <div class="card-body" id="systemAlertsBody">
          <div class="text-center p-3">⏳ Evaluando reglas del sistema...</div>
        </div>
      </div>

      <div id="overlapsContainer"></div>

      <div class="card mt-3">
        <div class="card-header"><h3>📊 Resumen de Límites por Trabajador</h3></div>
        <div class="card-body" id="limitsTableBody">
          <div class="text-center p-3">⏳ Calculando uso de días y vacaciones...</div>
        </div>
      </div>
    `;
  },

  // Inicialización y procesamiento de datos asíncronos desde Supabase
  async init() {
    const statsContainer = document.getElementById('alertsStatsContainer');
    const systemAlertsBody = document.getElementById('systemAlertsBody');
    const overlapsContainer = document.getElementById('overlapsContainer');
    const limitsTableBody = document.getElementById('limitsTableBody');

    try {
      // 1. Descarga paralela de datos de Supabase para optimizar tiempos de respuesta
      const [workers, rawRequests] = await Promise.all([
        SupabaseClient.getWorkers(),
        SupabaseClient.getRequests()
      ]);

      // 2. Normalizar estructura de las solicitudes
      const requests = rawRequests.map(r => ({
        id: r.id,
        workerId: r.worker_id || r.workerId,
        workerName: r.worker_name || r.workerName || 'Trabajador',
        type: r.type,
        status: r.status,
        startDate: r.start_date || r.startDate,
        endDate: r.end_date || r.endDate,
        days: parseInt(r.days) || 0
      }));

      // 3. Detectar traslapes de fechas en memoria de manera segura
      const overlaps = [];
      const activeRequests = requests.filter(r => !['rechazado', 'cancelado'].includes(r.status));
      
      for (let i = 0; i < activeRequests.length; i++) {
        for (let j = i + 1; j < activeRequests.length; j++) {
          const a = activeRequests[i];
          const b = activeRequests[j];
          if (a.workerId === b.workerId && Utils.datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
            overlaps.push({ a, b });
          }
        }
      }

      // Fallback seguro para extraer alertas globales calculadas previamente en App
      const systemAlerts = (window.App && window.App.alerts) ? window.App.alerts : [];

      // 4. Renderizar Tarjetas Estadísticas
      if (statsContainer) {
        const pendingCount = requests.filter(r => r.status === 'pendiente').length;
        statsContainer.innerHTML = `
          <div class="dashboard-stats mb-3">
            <div class="stat-card">
              <div class="stat-icon red">🔔</div>
              <div class="stat-content">
                <h4>Total Alertas</h4>
                <div class="stat-value">${systemAlerts.length + overlaps.length}</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon orange">📋</div>
              <div class="stat-content">
                <h4>Pendientes Autorización</h4>
                <div class="stat-value">${pendingCount}</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon yellow">⚠️</div>
              <div class="stat-content">
                <h4>Traslapes Detectados</h4>
                <div class="stat-value">${overlaps.length}</div>
              </div>
            </div>
          </div>
        `;
      }

      // 5. Renderizar Alertas del Sistema
      if (systemAlertsBody) {
        if (systemAlerts.length === 0) {
          systemAlertsBody.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>No hay alertas activas</p></div>';
        } else {
          systemAlertsBody.innerHTML = systemAlerts.map(a => `
            <div class="alert alert-${a.type}">
              <span class="alert-icon">${a.icon}</span>
              <span>${Utils.escapeHtml(a.message)}</span>
            </div>
          `).join('');
        }
      }

      // 6. Renderizar panel de Traslapes si existen incidencias
      if (overlapsContainer) {
        if (overlaps.length === 0) {
          overlapsContainer.innerHTML = '';
        } else {
          overlapsContainer.innerHTML = `
            <div class="card">
              <div class="card-header"><h3>⚠️ Fechas Duplicadas o Traslapadas</h3></div>
              <div class="card-body">
                ${overlaps.map(o => `
                  <div class="alert alert-danger">
                    <span class="alert-icon">📅</span>
                    <span>
                      <strong>${Utils.escapeHtml(o.a.workerName)}</strong>: 
                      ${Utils.getTypeLabel(o.a.type)} (${Utils.formatDate(o.a.startDate)} - ${Utils.formatDate(o.a.endDate)}) 
                      se traslapa con 
                      ${Utils.getTypeLabel(o.b.type)} (${Utils.formatDate(o.b.startDate)} - ${Utils.formatDate(o.b.endDate)})
                    </span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }

      // 7. Calcular y renderizar Matriz de Límites de Consumo de Días
      if (limitsTableBody) {
        const activeWorkers = workers.filter(w => w.active ?? true);
        const year = CONFIG.CURRENT_YEAR;

        // Filtrar solicitudes autorizadas del año corriente
        const authorizedYearRequests = requests.filter(r => 
          r.status === 'autorizado' && 
          r.startDate && 
          new Date(r.startDate).getFullYear() === year
        );

        let rowsHtml = '';

        activeWorkers.forEach(w => {
          const fullName = w.full_name || w.fullName || 'Trabajador';
          const vacationDays = w.vacation_days || w.vacationDays || 0;

          // Calcular consumos locales basándonos en la descarga única
          const ecoUsed = authorizedYearRequests
            .filter(r => r.workerId === w.id && r.type === 'economico')
            .reduce((s, r) => s + r.days, 0);

          const vacUsed = authorizedYearRequests
            .filter(r => r.workerId === w.id && r.type === 'vacaciones')
            .reduce((s, r) => s + r.days, 0);

          const ecoPercent = (ecoUsed / CONFIG.MAX_DIAS_ECONOMICOS) * 100;
          const vacPercent = vacationDays > 0 ? (vacUsed / vacationDays) * 100 : 0;
          
          let status = 'success', statusText = 'Normal';
          if (ecoUsed >= CONFIG.MAX_DIAS_ECONOMICOS || vacUsed >= vacationDays) {
            status = 'danger'; 
            statusText = 'Agotado';
          } else if (ecoPercent > 70 || vacPercent > 70) {
            status = 'warning'; 
            statusText = 'Por agotar';
          }

          rowsHtml += `
            <tr>
              <td>${Utils.escapeHtml(fullName)}</td>
              <td>
                ${ecoUsed}/${CONFIG.MAX_DIAS_ECONOMICOS}
                <div class="progress-bar mt-1">
                  <div class="progress-fill ${ecoPercent > 80 ? 'danger' : ecoPercent > 60 ? 'warning' : 'success'}" style="width:${Math.min(ecoPercent, 100)}%"></div>
                </div>
              </td>
              <td>
                ${vacUsed}/${vacationDays}
                <div class="progress-bar mt-1">
                  <div class="progress-fill ${vacPercent > 80 ? 'danger' : 'primary'}" style="width:${Math.min(vacPercent, 100)}%"></div>
                </div>
              </td>
              <td><span class="badge badge-${status === 'danger' ? 'rechazado' : status === 'warning' ? 'pendiente' : 'autorizado'}">${statusText}</span></td>
            </tr>
          `;
        });

        limitsTableBody.innerHTML = `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Días Económicos</th>
                  <th>Vacaciones</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="4" class="text-center">No hay trabajadores activos registrados</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      }

    } catch (err) {
      console.error("Error crítico al inicializar AlertsModule:", err);
      if (systemAlertsBody) {
        systemAlertsBody.innerHTML = '<div class="text-error">Error al conectar con Supabase al generar reporte de alertas.</div>';
      }
    }
  }
};
