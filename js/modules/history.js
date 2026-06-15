/**
 * Módulo Historial - Consulta de historial completo por trabajador (Versión Supabase)
 */
const HistoryModule = {
  // Renderizado asíncrono inicial para poblar el selector de trabajadores desde la base de datos
  async render() {
    let workers = [];
    try {
      workers = await SupabaseClient.getWorkers();
      // Ordenar alfabéticamente por nombre completo
      workers.sort((a, b) => {
        const nameA = a.full_name || a.fullName || '';
        const nameB = b.full_name || b.fullName || '';
        return nameA.localeCompare(nameB);
      });
    } catch (err) {
      console.error("Error al obtener trabajadores para el historial:", err);
    }

    return `
      <div class="card">
        <div class="card-header"><h3>📜 Historial de Solicitudes</h3></div>
        <div class="card-body">
          <div class="filters-bar no-print">
            <div class="form-group">
              <label>Seleccionar Trabajador</label>
              <select class="form-control" id="histWorker">
                <option value="">-- Seleccionar trabajador --</option>
                ${workers.map(w => {
                  const fullName = w.full_name || w.fullName;
                  const empNum = w.employee_number || w.employeeNumber;
                  const isActive = w.active ?? true;
                  return `<option value="${w.id}">${Utils.escapeHtml(fullName)} (${empNum})${!isActive ? ' [Inactivo]' : ''}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Tipo</label>
              <select class="form-control" id="histType">
                <option value="">Todos</option>
                ${Object.entries(CONFIG.REQUEST_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Estatus</label>
              <select class="form-control" id="histStatus">
                <option value="">Todos</option>
                ${Object.entries(CONFIG.STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <div id="historyContent">
            <div class="empty-state">
              <div class="empty-state-icon">📜</div>
              <p>Seleccione un trabajador para ver su historial</p>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    document.getElementById('histWorker').addEventListener('change', () => this.renderHistory());
    document.getElementById('histType').addEventListener('change', () => this.renderHistory());
    document.getElementById('histStatus').addEventListener('change', () => this.renderHistory());
  },

  // Consulta y procesamiento de la línea de tiempo de forma asíncrona
  async renderHistory() {
    const workerId = document.getElementById('histWorker').value;
    const container = document.getElementById('historyContent');

    if (!workerId) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><p>Seleccione un trabajador para ver su historial</p></div>';
      return;
    }

    try {
      // Indicador de carga visual mientras se resuelven las peticiones
      container.innerHTML = '<div class="text-center p-3"><span class="spinner">⏳ Cargando historial...</span></div>';

      // Consultas paralelas a Supabase para agilizar el tiempo de respuesta
      const [workers, rawRequests, ecoUsed, vacUsed] = await Promise.all([
        SupabaseClient.getWorkers(),
        SupabaseClient.getRequests(),
        typeof SupabaseClient.getUsedDays === 'function' ? SupabaseClient.getUsedDays(workerId, 'economico') : Promise.resolve(0),
        typeof SupabaseClient.getUsedDays === 'function' ? SupabaseClient.getUsedDays(workerId, 'vacaciones') : Promise.resolve(0)
      ]);

      const worker = workers.find(w => w.id === workerId);
      if (!worker) {
        container.innerHTML = '<div class="empty-state"><p class="text-error">No se encontró la información del trabajador seleccionado</p></div>';
        return;
      }

      // Filtrar y mapear solicitudes normalizando nomenclatura snake_case y camelCase
      let requests = rawRequests
        .filter(r => (r.worker_id || r.workerId) === workerId)
        .map(r => ({
          id: r.id,
          type: r.type,
          status: r.status,
          startDate: r.start_date || r.startDate,
          endDate: r.end_date || r.endDate,
          days: parseInt(r.days) || 0,
          reason: r.reason || '',
          observations: r.observations || '',
          capturedBy: r.captured_by || r.capturedBy || '',
          captureDate: r.capture_date || r.captureDate || r.created_at,
          authorizedBy: r.authorized_by || r.authorizedBy || '',
          authorizationDate: r.authorization_date || r.authorizationDate || null,
          authorizationComment: r.authorization_comment || r.authorizationComment || ''
        }));

      // Aplicar filtros de la barra de herramientas en memoria de manera segura
      const typeFilter = document.getElementById('histType').value;
      const statusFilter = document.getElementById('histStatus').value;
      if (typeFilter) requests = requests.filter(r => r.type === typeFilter);
      if (statusFilter) requests = requests.filter(r => r.status === statusFilter);

      // Ordenar del más reciente al más antiguo
      requests.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

      const workerName = worker.full_name || worker.fullName;
      const empNumber = worker.employee_number || worker.employeeNumber;
      const vacationDays = worker.vacation_days || worker.vacationDays || 0;

      container.innerHTML = `
        <div class="dashboard-stats mb-3">
          <div class="stat-card">
            <div class="stat-icon orange">👤</div>
            <div class="stat-content">
              <h4>${Utils.escapeHtml(workerName)}</h4>
              <div class="stat-sub">${empNumber} | ${Utils.escapeHtml(worker.area || '-')} | ${Utils.escapeHtml(worker.position || '-')}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon turquoise">💰</div>
            <div class="stat-content">
              <h4>Días Económicos</h4>
              <div class="stat-value">${ecoUsed}/${CONFIG.MAX_DIAS_ECONOMICOS}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">🏖️</div>
            <div class="stat-content">
              <h4>Vacaciones</h4>
              <div class="stat-value">${vacUsed}/${vacationDays}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon teal">📋</div>
            <div class="stat-content">
              <h4>Total Solicitudes</h4>
              <div class="stat-value">${requests.length}</div>
            </div>
          </div>
        </div>

        ${requests.length === 0 ? '<div class="empty-state"><p>No hay solicitudes registradas con los filtros seleccionados</p></div>' : `
          <div class="history-timeline">
            ${requests.map(r => `
              <div class="history-item">
                <div class="history-item-header">
                  ${Utils.getTypeBadge(r.type)}
                  ${Utils.getStatusBadge(r.status)}
                  <span class="history-item-date">${Utils.formatDate(r.startDate)} - ${Utils.formatDate(r.endDate)} (${r.days} días)</span>
                </div>
                <p><strong>Motivo:</strong> ${Utils.escapeHtml(r.reason)}</p>
                ${r.observations ? `<p><strong>Observaciones:</strong> ${Utils.escapeHtml(r.observations)}</p>` : ''}
                <p class="text-muted" style="font-size:0.8rem;">
                  Capturó: ${Utils.escapeHtml(r.capturedBy)} (${Utils.formatDateTime ? Utils.formatDateTime(r.captureDate) : r.captureDate})
                  ${r.authorizedBy ? ` | Autorizó: ${Utils.escapeHtml(r.authorizedBy)} (${Utils.formatDateTime ? Utils.formatDateTime(r.authorizationDate) : r.authorizationDate})` : ''}
                </p>
                ${r.authorizationComment ? `<p class="text-muted" style="font-size:0.8rem;"><em>${Utils.escapeHtml(r.authorizationComment)}</em></p>` : ''}
              </div>
            `).join('')}
          </div>
        `}
      `;
    } catch (err) {
      console.error("Error al procesar y renderizar el historial:", err);
      container.innerHTML = '<div class="empty-state"><p class="text-error">Error al conectar con el servidor para traer el historial</p></div>';
    }
  }
};
