/**
 * Módulo Reportes - Generación, visualización e impresión de reportes (Versión Supabase)
 */
const ReportsModule = {
  currentReportData: [],
  _lastPresetData: [],
  _lastPresetId: null,

  // 1. Renderizado asíncrono para poblar dinámicamente los selectores desde Supabase
  async render() {
    let workers = [];
    let requests = [];
    
    try {
      // Obtenemos los datos base de manera paralela
      const [workersData, requestsData] = await Promise.all([
        SupabaseClient.getWorkers(),
        SupabaseClient.getRequests()
      ]);
      
      workers = workersData.filter(w => w.active || w.active === undefined);
      requests = requestsData;
    } catch (err) {
      console.error("Error al obtener datos para el módulo de reportes:", err);
    }

    // Extracción dinámica de valores únicos para los filtros en base a los datos reales
    const uniqueAreas = [...new Set(workers.map(w => w.area || w.area_name).filter(Boolean))].sort();
    
    // Agrupación de jefes únicos mapeando ID y Nombre
    const bossMap = new Map();
    workers.forEach(w => {
      const bossId = w.immediate_boss_id || w.immediateBossId;
      const bossName = w.immediate_boss || w.immediateBoss;
      if (bossId && bossName) {
        bossMap.set(bossId, bossName);
      }
    });
    const uniqueBosses = Array.from(bossMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

    return `
      <div class="tabs no-print">
        <button class="tab-btn active" data-tab="period">Reporte por Periodo</button>
        <button class="tab-btn" data-tab="presets">Reportes Predefinidos</button>
      </div>

      <div class="tab-content active" id="tab-period">
        <div class="report-filters no-print">
          <div class="form-row">
            <div class="form-group">
              <label>Fecha Inicial <span class="required">*</span></label>
              <input type="date" class="form-control" id="repStartDate">
            </div>
            <div class="form-group">
              <label>Fecha Final <span class="required">*</span></label>
              <input type="date" class="form-control" id="repEndDate">
            </div>
            <div class="form-group">
              <label>Trabajador</label>
              <select class="form-control" id="repWorker">
                <option value="">Todos</option>
                ${workers.map(w => `<option value="${w.id}">${Utils.escapeHtml(w.full_name || w.fullName)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Tipo de Solicitud</label>
              <select class="form-control" id="repType">
                <option value="">Todos</option>
                ${Object.entries(CONFIG.REQUEST_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Estatus</label>
              <select class="form-control" id="repStatus">
                <option value="">Todos</option>
                ${Object.entries(CONFIG.STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Área</label>
              <select class="form-control" id="repArea">
                <option value="">Todas</option>
                ${uniqueAreas.map(a => `<option value="${a}">${Utils.escapeHtml(a)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Jefe Inmediato</label>
              <select class="form-control" id="repBoss">
                <option value="">Todos</option>
                ${uniqueBosses.map(b => `<option value="${b.id}">${Utils.escapeHtml(b.name)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="report-actions no-print">
          <button class="btn btn-primary" id="btnGenerateReport">📊 Generar Reporte</button>
          <button class="btn btn-secondary" id="btnPrintReport">🖨️ Imprimir</button>
          <button class="btn btn-outline" id="btnExportExcel">📥 Exportar Excel</button>
          <button class="btn btn-outline" id="btnExportPDF">📄 Exportar PDF</button>
        </div>

        <div id="reportPreview" class="report-preview hidden">
          <div class="report-header-print">
            <h2>${CONFIG.APP_NAME}</h2>
            <p>Reporte de Solicitudes por Periodo</p>
            <p class="report-meta" id="reportMeta"></p>
          </div>
          <div class="report-summary" id="reportSummary"></div>
          <div class="table-wrapper">
            <table class="data-table" id="reportTable">
              <thead>
                <tr>
                  <th>No. Empleado</th>
                  <th>Trabajador</th>
                  <th>Área</th>
                  <th>Tipo</th>
                  <th>F. Inicial</th>
                  <th>F. Final</th>
                  <th>Días</th>
                  <th>Motivo</th>
                  <th>Estatus</th>
                  <th>Jefe</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody id="reportTableBody"></tbody>
            </table>
          </div>
          <div style="padding:1rem 1.5rem; font-size:0.8rem; color:#666; border-top:1px solid #ddd;">
            Fecha de impresión: <span id="reportPrintDate"></span>
          </div>
        </div>
      </div>

      <div class="tab-content" id="tab-presets">
        <div class="dashboard-stats">
          ${this.getPresetCards().map(p => `
            <div class="stat-card" style="cursor:pointer;" onclick="ReportsModule.generatePreset('${p.id}')">
              <div class="stat-icon ${p.color}">${p.icon}</div>
              <div class="stat-content">
                <h4>${p.title}</h4>
                <div class="stat-sub">${p.description}</div>
              </div>
            </div>
          `).join('')}
        </div>
        <div id="presetReportPreview" class="mt-3"></div>
      </div>
    `;
  },

  getPresetCards() {
    return [
      { id: 'by_worker', title: 'Por Trabajador', description: 'Todas las solicitudes agrupadas', icon: '👤', color: 'orange' },
      { id: 'by_type', title: 'Por Tipo', description: 'Clasificación por tipo de día', icon: '📊', color: 'turquoise' },
      { id: 'annual', title: 'Reporte Anual', description: `Solicitudes del ${CONFIG.CURRENT_YEAR}`, icon: '📅', color: 'teal' },
      { id: 'monthly', title: 'Reporte Mensual', description: 'Mes actual', icon: '📆', color: 'yellow' },
      { id: 'economic', title: 'Días Económicos', description: 'Disponibles y usados', icon: '💰', color: 'orange' },
      { id: 'vacations', title: 'Vacaciones Pendientes', description: 'Saldo de vacaciones', icon: '🏖️', color: 'turquoise' },
      { id: 'incapacity', title: 'Incapacidades', description: 'Registro de incapacidades', icon: '🏥', color: 'red' },
      { id: 'changes', title: 'Cambios Operatividad', description: 'Cambios de día', icon: '🔄', color: 'teal' }
    ];
  },

  init() {
    // Manejo de pestañas
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      });
    });

    // Fechas por defecto: mes actual
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    if(document.getElementById('repStartDate')) document.getElementById('repStartDate').value = firstDay;
    if(document.getElementById('repEndDate')) document.getElementById('repEndDate').value = lastDay;

    document.getElementById('btnGenerateReport').addEventListener('click', () => this.generatePeriodReport());
    document.getElementById('btnPrintReport').addEventListener('click', () => window.print());
    document.getElementById('btnExportExcel').addEventListener('click', () => this.exportExcel());
    document.getElementById('btnExportPDF').addEventListener('click', () => this.exportPDF());
  },

  getPeriodFilters() {
    return {
      startDate: document.getElementById('repStartDate').value,
      endDate: document.getElementById('repEndDate').value,
      workerId: document.getElementById('repWorker').value,
      type: document.getElementById('repType').value,
      status: document.getElementById('repStatus').value,
      area: document.getElementById('repArea').value,
      bossId: document.getElementById('repBoss').value
    };
  },

  // 2. Convertido a async para consultar de manera segura a la API de Supabase
  async generatePeriodReport() {
    const filters = this.getPeriodFilters();
    if (!filters.startDate || !filters.endDate) {
      Utils.showToast('Seleccione el periodo de fechas', 'error');
      return;
    }

    try {
      const rawRequests = await SupabaseClient.getRequests();
      
      // Normalización de llaves e inyección de filtros en frontend
      const normalizedRequests = rawRequests.map(r => ({
        id: r.id,
        workerId: r.worker_id || r.workerId,
        workerName: r.worker_name || r.workerName,
        employeeNumber: r.employee_number || r.employeeNumber,
        area: r.area,
        type: r.type,
        startDate: r.start_date || r.startDate,
        endDate: r.end_date || r.endDate,
        days: parseInt(r.days) || 0,
        reason: r.reason || '',
        status: r.status,
        immediateBoss: r.immediate_boss || r.immediateBoss,
        immediateBossId: r.immediate_boss_id || r.immediateBossId,
        observations: r.observations || ''
      }));

      // Aplicar filtros en memoria
      this.currentReportData = normalizedRequests.filter(r => {
        if (r.startDate < filters.startDate || r.startDate > filters.endDate) return false;
        if (filters.workerId && r.workerId !== filters.workerId) return false;
        if (filters.type && r.type !== filters.type) return false;
        if (filters.status && r.status !== filters.status) return false;
        if (filters.area && r.area !== filters.area) return false;
        if (filters.bossId && r.immediateBossId !== filters.bossId) return false;
        return true;
      }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

      const preview = document.getElementById('reportPreview');
      preview.classList.remove('hidden');

      document.getElementById('reportMeta').textContent =
        `Periodo: ${Utils.formatDate(filters.startDate)} al ${Utils.formatDate(filters.endDate)}`;

      const totalDays = this.currentReportData.reduce((s, r) => s + r.days, 0);
      const uniqueWorkersCount = new Set(this.currentReportData.map(r => r.workerId)).size;
      const pendingCount = this.currentReportData.filter(r => r.status === 'pendiente').length;

      document.getElementById('reportSummary').innerHTML = `
        <div class="report-summary-item"><div class="value">${this.currentReportData.length}</div><div class="label">Solicitudes</div></div>
        <div class="report-summary-item"><div class="value">${totalDays}</div><div class="label">Total Días</div></div>
        <div class="report-summary-item"><div class="value">${uniqueWorkersCount}</div><div class="label">Trabajadores</div></div>
        <div class="report-summary-item"><div class="value">${pendingCount}</div><div class="label">Pendientes</div></div>
      `;

      document.getElementById('reportPrintDate').textContent = new Date().toLocaleDateString('es-MX', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const tbody = document.getElementById('reportTableBody');
      if (this.currentReportData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No hay registros para el periodo seleccionado</td></tr>';
        return;
      }

      tbody.innerHTML = this.currentReportData.map(r => `
        <tr>
          <td>${Utils.escapeHtml(r.employeeNumber)}</td>
          <td>${Utils.escapeHtml(r.workerName)}</td>
          <td>${Utils.escapeHtml(r.area)}</td>
          <td>${Utils.getTypeLabel(r.type)}</td>
          <td>${Utils.formatDate(r.startDate)}</td>
          <td>${Utils.formatDate(r.endDate)}</td>
          <td>${r.days}</td>
          <td>${Utils.escapeHtml(r.reason)}</td>
          <td>${CONFIG.STATUS[r.status]?.label || r.status}</td>
          <td>${Utils.escapeHtml(r.immediateBoss || '-')}</td>
          <td>${Utils.escapeHtml(r.observations || '')}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error("Error al generar el reporte:", err);
      Utils.showToast("Error al procesar el reporte", "error");
    }
  },

  exportExcel() {
    if (this.currentReportData.length === 0) {
      Utils.showToast('Genere un reporte primero', 'error');
      return;
    }
    const data = this.currentReportData.map(r => Utils.requestToReportRow(r));
    Utils.exportToExcel(data, `reporte_${Date.now()}`, 'Solicitudes');
  },

  exportPDF() {
    if (this.currentReportData.length === 0) {
      Utils.showToast('Genere un reporte primero', 'error');
      return;
    }
    const filters = this.getPeriodFilters();
    const headers = ['No.Emp', 'Trabajador', 'Área', 'Tipo', 'F.Inicial', 'F.Final', 'Días', 'Motivo', 'Estatus', 'Jefe', 'Obs.'];
    const rows = this.currentReportData.map(r => [
      r.employeeNumber, r.workerName, r.area, Utils.getTypeLabel(r.type),
      Utils.formatDate(r.startDate), Utils.formatDate(r.endDate), r.days,
      r.reason, CONFIG.STATUS[r.status]?.label, r.immediateBoss || '', r.observations || ''
    ]);
    Utils.exportToPDF('Reporte de Solicitudes por Periodo', headers, rows, `reporte_${Date.now()}`, {
      dateRange: `${Utils.formatDate(filters.startDate)} - ${Utils.formatDate(filters.endDate)}`,
      summary: this.currentReportData.length
    });
  },

  // 3. Modificado a asíncrono integral para realizar cálculos de presets basados en promesas reales
  async generatePreset(presetId) {
    const container = document.getElementById('presetReportPreview');
    if (!container) return;
    
    let html = '';
    let exportData = [];

    try {
      const [workersData, requestsData] = await Promise.all([
        SupabaseClient.getWorkers(),
        SupabaseClient.getRequests()
      ]);

      const workers = workersData.filter(w => w.active || w.active === undefined);
      
      // Normalización general del listado de solicitudes
      const requests = requestsData.map(r => ({
        id: r.id,
        workerId: r.worker_id || r.workerId,
        workerName: r.worker_name || r.workerName,
        employeeNumber: r.employee_number || r.employeeNumber,
        area: r.area,
        type: r.type,
        startDate: r.start_date || r.startDate,
        endDate: r.end_date || r.endDate,
        days: parseInt(r.days) || 0,
        reason: r.reason || '',
        status: r.status,
        workedDate: r.worked_date || r.workedDate,
        swapDate: r.swap_date || r.swapDate
      }));

      switch (presetId) {
        case 'by_worker': {
          exportData = workers.map(w => {
            const reqs = requests.filter(r => r.workerId === w.id);
            const totalDays = reqs.reduce((s, r) => s + r.days, 0);
            return { 
              'Trabajador': w.full_name || w.fullName, 
              'No. Empleado': w.employee_number || w.employeeNumber, 
              'Área': w.area, 
              'Total Solicitudes': reqs.length, 
              'Total Días': totalDays 
            };
          });
          html = this.renderPresetTable(['Trabajador', 'No. Empleado', 'Área', 'Total Solicitudes', 'Total Días'], exportData);
          break;
        }
        case 'by_type': {
          Object.keys(CONFIG.REQUEST_TYPES).forEach(t => {
            const reqs = requests.filter(r => r.type === t);
            exportData.push({ 
              'Tipo': Utils.getTypeLabel(t), 
              'Cantidad': reqs.length, 
              'Total Días': reqs.reduce((s, r) => s + r.days, 0) 
            });
          });
          html = this.renderPresetTable(['Tipo', 'Cantidad', 'Total Días'], exportData);
          break;
        }
        case 'annual': {
          const currentYear