/**
 * Módulo Solicitudes - Registro y gestión de solicitudes de días (Versión Supabase)
 */
const RequestsModule = {
  // 1. Convertido a async para poder cargar los trabajadores en el filtro dinámicamente
  async render() {
    const canEdit = Auth.canEdit();
    
    // Obtenemos trabajadores para llenar el selector de filtros
    let workers = [];
    try {
      workers = await SupabaseClient.getWorkers();
      // Filtrar activos en memoria
      workers = workers.filter(w => w.active || w.active === undefined);
    } catch (err) {
      console.error("Error al obtener trabajadores para filtros:", err);
    }

    return `
      <div class="card">
        <div class="card-header">
          <h3>📝 Registro de Solicitudes</h3>
          ${canEdit ? '<button class="btn btn-primary btn-sm" id="btnAddRequest">+ Nueva Solicitud</button>' : ''}
        </div>
        <div class="card-body">
          <div class="filters-bar no-print">
            <div class="form-group">
              <label>Trabajador</label>
              <select class="form-control" id="reqWorkerFilter">
                <option value="">Todos</option>
                ${workers.map(w => `<option value="${w.id}">${Utils.escapeHtml(w.full_name || w.fullName)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Tipo</label>
              <select class="form-control" id="reqTypeFilter">
                <option value="">Todos</option>
                ${Object.entries(CONFIG.REQUEST_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Estatus</label>
              <select class="form-control" id="reqStatusFilter">
                <option value="">Todos</option>
                ${Object.entries(CONFIG.STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th>Tipo</th>
                  <th>Fechas</th>
                  <th>Días</th>
                  <th>Motivo</th>
                  <th>Estatus</th>
                  <th>Jefe</th>
                  ${canEdit ? '<th>Acciones</th>' : ''}
                </tr>
              </thead>
              <tbody id="requestsTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.renderTable();
    ['reqWorkerFilter', 'reqTypeFilter', 'reqStatusFilter'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.renderTable());
    });
    document.getElementById('btnAddRequest')?.addEventListener('click', () => this.showForm());
  },

  // 2. Convertido a async para esperar la respuesta de Supabase antes de filtrar
  async getFilteredRequests() {
    const filters = {
      workerId: document.getElementById('reqWorkerFilter')?.value || null,
      type: document.getElementById('reqTypeFilter')?.value || null,
      status: document.getElementById('reqStatusFilter')?.value || null
    };

    // Usamos el cliente pasándole parámetros si tu método getRequests los acepta de forma nativa
    let requests = await SupabaseClient.getRequests(filters);

    // Mapeo por si las columnas en Supabase usan snake_case (capture_date, worker_name, etc.)
    requests = requests.map(r => ({
      id: r.id,
      workerId: r.worker_id || r.workerId,
      workerName: r.worker_name || r.workerName,
      employeeNumber: r.employee_number || r.employeeNumber,
      type: r.type,
      startDate: r.start_date || r.startDate,
      endDate: r.end_date || r.endDate,
      days: r.days,
      reason: r.reason,
      observations: r.observations,
      status: r.status,
      immediateBoss: r.immediate_boss || r.immediateBoss,
      immediateBossId: r.immediate_boss_id || r.immediateBossId,
      captureDate: r.capture_date || r.captureDate,
      workedDate: r.worked_date || r.workedDate,
      swapDate: r.swap_date || r.swapDate,
      capturedBy: r.captured_by || r.capturedBy,
      authorizedBy: r.authorized_by || r.authorizedBy,
      authorizationDate: r.authorization_date || r.authorizationDate,
      authorizationComment: r.authorization_comment || r.authorizationComment
    }));

    // Filtros secundarios redundantes en frontend por si acaso
    if (filters.workerId) requests = requests.filter(r => r.workerId === filters.workerId);
    if (filters.type) requests = requests.filter(r => r.type === filters.type);
    if (filters.status) requests = requests.filter(r => r.status === filters.status);

    return requests.sort((a, b) => new Date(b.captureDate) - new Date(a.captureDate));
  },

  // 3. Convertido a async para esperar el método getFilteredRequests
  async renderTable() {
    const tbody = document.getElementById('requestsTableBody');
    if (!tbody) return;

    try {
      const requests = await this.getFilteredRequests();
      const canEdit = Auth.canEdit();

      if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No hay solicitudes</td></tr>';
        return;
      }

      tbody.innerHTML = requests.map(r => `
        <tr>
          <td>
            <strong>${Utils.escapeHtml(r.workerName)}</strong><br>
            <small class="text-muted">${Utils.escapeHtml(r.employeeNumber)}</small>
          </td>
          <td>${Utils.getTypeBadge(r.type)}</td>
          <td>${Utils.formatDate(r.startDate)} - ${Utils.formatDate(r.endDate)}</td>
          <td><strong>${r.days}</strong></td>
          <td>${Utils.escapeHtml(r.reason ? r.reason.substring(0, 40) : '')}${r.reason && r.reason.length > 40 ? '...' : ''}</td>
          <td>${Utils.getStatusBadge(r.status)}</td>
          <td>${Utils.escapeHtml(r.immediateBoss || '-')}</td>
          ${canEdit ? `
            <td class="actions">
              <button class="btn btn-secondary btn-sm" onclick="RequestsModule.showForm('${r.id}')">✏️</button>
              <button class="btn btn-outline btn-sm" onclick="RequestsModule.viewDetail('${r.id}')">👁️</button>
              ${r.status === 'pendiente' ? `<button class="btn btn-danger btn-sm" onclick="RequestsModule.cancelRequest('${r.id}')">✖</button>` : ''}
            </td>
          ` : `<td><button class="btn btn-outline btn-sm" onclick="RequestsModule.viewDetail('${r.id}')">👁️</button></td>`}
        </tr>
      `).join('');
    } catch (err) {
      console.error("Error al renderizar tabla de solicitudes:", err);
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error al cargar registros</td></tr>';
    }
  },

  // 4. Convertido a async para obtener la lista de trabajadores y la solicitud seleccionada
  async showForm(requestId = null) {
    try {
      let request = null;
      const allWorkers = await SupabaseClient.getWorkers();
      const workers = allWorkers.filter(w => w.active || w.active === undefined);

      if (requestId) {
        // En lugar de método síncrono, buscamos de la lista global asíncrona
        const requests = await SupabaseClient.getRequests();
        request = requests.find(r => r.id === requestId);
        if (request) {
          // Normalización interna
          request.workerId = request.worker_id || request.workerId;
          request.startDate = request.start_date || request.startDate;
          request.endDate = request.end_date || request.endDate;
          request.workedDate = request.worked_date || request.workedDate;
          request.swapDate = request.swap_date || request.swapDate;
          request.immediateBoss = request.immediate_boss || request.immediateBoss;
          request.immediateBossId = request.immediate_boss_id || request.immediateBossId;
        }
      }

      const isEdit = !!request;
      const session = Auth.getSession();

      const body = `
        <form id="requestForm">
          <div class="form-row">
            <div class="form-group">
              <label>Trabajador <span class="required">*</span></label>
              <select class="form-control" name="workerId" id="reqWorkerId" required ${isEdit ? 'disabled' : ''}>
                <option value="">-- Seleccionar --</option>
                ${workers.map(w => `<option value="${w.id}" ${request?.workerId === w.id ? 'selected' : ''} data-boss="${w.immediate_boss_id || w.immediateBossId || ''}" data-bossname="${Utils.escapeHtml(w.immediate_boss || w.immediateBoss || '')}">${Utils.escapeHtml(w.full_name || w.fullName)} (${w.employee_number || w.employeeNumber})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Tipo de Solicitud <span class="required">*</span></label>
              <select class="form-control" name="type" id="reqType" required>
                <option value="">-- Seleccionar --</option>
                ${Object.entries(CONFIG.REQUEST_TYPES).map(([k, v]) => `<option value="${k}" ${request?.type === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <div id="workerDaysInfo" class="alert alert-info hidden"></div>

          <div class="form-row">
            <div class="form-group">
              <label>Fecha Inicial <span class="required">*</span></label>
              <input type="date" class="form-control" name="startDate" id="reqStartDate" value="${request?.startDate || ''}" required>
            </div>
            <div class="form-group">
              <label>Fecha Final <span class="required">*</span></label>
              <input type="date" class="form-control" name="endDate" id="reqEndDate" value="${request?.endDate || ''}" required>
            </div>
            <div class="form-group">
              <label>Número de Días</label>
              <input type="number" class="form-control" name="days" id="reqDays" value="${request?.days || ''}" readonly>
            </div>
          </div>

          <div id="cambioDiaFields" class="hidden">
            <div class="form-row">
              <div class="form-group">
                <label>Fecha Trabajada <span class="required">*</span></label>
                <input type="date" class="form-control" name="workedDate" value="${request?.workedDate || ''}">
              </div>
              <div class="form-group">
                <label>Fecha que se Cambiará <span class="required">*</span></label>
                <input type="date" class="form-control" name="swapDate" value="${request?.swapDate || ''}">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>Motivo <span class="required">*</span></label>
            <input type="text" class="form-control" name="reason" value="${Utils.escapeHtml(request?.reason || '')}" required>
          </div>
          <div class="form-group">
            <label>Observaciones</label>
            <textarea class="form-control" name="observations" rows="2">${Utils.escapeHtml(request?.observations || '')}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Jefe Inmediato</label>
              <input type="text" class="form-control" name="immediateBoss" id="reqBoss" value="${Utils.escapeHtml(request?.immediateBoss || '')}" readonly>
              <input type="hidden" name="immediateBossId" id="reqBossId" value="${request?.immediateBossId || ''}">
            </div>
            <div class="form-group">
              <label>Documento/Comprobante</label>
              <input type="text" class="form-control" name="document" value="${Utils.escapeHtml(request?.document || '')}" placeholder="Nombre del archivo adjunto">
            </div>
          </div>
          ${isEdit ? `
            <div class="form-group">
              <label>Estatus</label>
              <select class="form-control" name="status">
                ${Object.entries(CONFIG.STATUS).map(([k, v]) => `<option value="${k}" ${request?.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
              </select>
            </div>
          ` : ''}
          <div id="requestFormErrors"></div>
        </form>
      `;

      const footer = `
        <button class="btn btn-outline" onclick="Utils.closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="btnSaveRequest">${isEdit ? 'Actualizar' : 'Registrar Solicitud'}</button>
      `;

      Utils.openModal(isEdit ? 'Editar Solicitud' : 'Nueva Solicitud', body, footer, true);

      const workerSelect = document.getElementById('reqWorkerId');
      const typeSelect = document.getElementById('reqType');
      const startInput = document.getElementById('reqStartDate');
      const endInput = document.getElementById('reqEndDate');

      const updateDays = () => {
        if (startInput.value && endInput.value) {
          document.getElementById('reqDays').value = Utils.calculateDays(startInput.value, endInput.value);
        }
      };

      // Manejo asíncrono para renderizar los días consumidos por el trabajador seleccionado
      const updateWorkerInfo = async () => {
        const opt = workerSelect.selectedOptions[0];
        if (opt && opt.value) {
          document.getElementById('reqBoss').value = opt.dataset.bossname || '';
          document.getElementById('reqBossId').value = opt.dataset.boss || '';
          
          const worker = allWorkers.find(w => w.id === opt.value);
          if (!worker) return;

          const workerFullName = worker.full_name || worker.fullName;
          const workerVacationDays = worker.vacation_days || worker.vacationDays || 0;

          const info = document.getElementById('workerDaysInfo');
          
          // Consultas asíncronas de días calculados
          const ecoUsed = typeof SupabaseClient.getUsedDays === 'function' ? await SupabaseClient.getUsedDays(worker.id, 'economico') : 0;
          const vacUsed = typeof SupabaseClient.getUsedDays === 'function' ? await SupabaseClient.getUsedDays(worker.id, 'vacaciones') : 0;
          
          info.innerHTML = `📊 <strong>${workerFullName}:</strong> Económicos ${ecoUsed}/${CONFIG.MAX_DIAS_ECONOMICOS} usados | Vacaciones ${vacUsed}/${workerVacationDays} usados`;
          info.classList.remove('hidden');
        }
      };

      const toggleCambioDia = () => {
        document.getElementById('cambioDiaFields').classList.toggle('hidden', typeSelect.value !== 'cambio_dia');
      };

      workerSelect?.addEventListener('change', updateWorkerInfo);
      typeSelect?.addEventListener('change', toggleCambioDia);
      startInput?.addEventListener('change', updateDays);
      endInput?.addEventListener('change', updateDays);

      if (request?.workerId) await updateWorkerInfo();
      toggleCambioDia();

      document.getElementById('btnSaveRequest').addEventListener('click', () => this.saveRequest(requestId));
    } catch (err) {
      console.error("Error al montar el formulario de solicitudes:", err);
    }
  },

  // 5. Convertido a async para interactuar con la base de datos
  async saveRequest(requestId = null) {
    const form = document.getElementById('requestForm');
    const formData = new FormData(form);
    const session = Auth.getSession();
    
    const allWorkers = await SupabaseClient.getWorkers();
    const worker = allWorkers.find(w => w.id === formData.get('workerId'));

    // Mapeo en formato snake_case listo para insertar en Supabase
    const data = {
      worker_id: formData.get('workerId'),
      worker_name: worker ? (worker.full_name || worker.fullName) : '',
      employee_number: worker ? (worker.employee_number || worker.employeeNumber) : '',
      area: worker ? worker.area : '',
      type: formData.get('type'),
      start_date: formData.get('startDate'),
      end_date: formData.get('endDate'),
      days: parseInt(formData.get('days')) || Utils.calculateDays(formData.get('startDate'), formData.get('endDate')),
      reason: formData.get('reason').trim(),
      observations: formData.get('observations').trim(),
      immediate_boss: formData.get('immediateBoss'),
      immediate_boss_id: formData.get('immediateBossId') || null,
      document: formData.get('document') || null,
      worked_date: formData.get('workedDate') || null,
      swap_date: formData.get('swapDate') || null,
      status: formData.get('status') || 'pendiente'
    };

    // Estructura temporal para validación en el frontend tradicional (camelCase)
    const validationData = {
      workerId: data.worker_id,
      workerName: data.worker_name,
      employeeNumber: data.employee_number,
      area: data.area,
      type: data.type,
      startDate: data.start_date,
      endDate: data.end_date,
      days: data.days,
      reason: data.reason,
      observations: data.observations,
      immediateBoss: data.immediate_boss,
      immediateBossId: data.immediate_boss_id,
      document: data.document,
      workedDate: data.worked_date,
      swapDate: data.swap_date,
      status: data.status
    };

    const validation = Validators.validateRequest(validationData, requestId);
    if (!validation.valid) {
      document.getElementById('requestFormErrors').innerHTML = validation.errors.map(e =>
        `<div class="form-error">${e}</div>`
      ).join('');
      return;
    }

    try {
      if (requestId) {
        await window.supabaseClient
          .from('requests')
          .update(data)
          .eq('id', requestId);
        Utils.showToast('Solicitud actualizada');
      } else {
        const newRequest = {
          ...data,
          captured_by: session.name,
          captured_by_id: session.userId,
          authorized_by: null,
          authorized_by_id: null,
          capture_date: new Date().toISOString(),
          authorization_date: null,
          authorization_comment: ''
        };
        
        await window.supabaseClient
          .from('requests')
          .insert([newRequest]);
          
        Utils.showToast('Solicitud registrada');
      }

      if (typeof SupabaseClient.recalculateEconomicDays === 'function') {
        await SupabaseClient.recalculateEconomicDays();
      }
      
      Utils.closeModal();
      this.renderTable();
      if (window.App && App.updateAlertBadge) App.updateAlertBadge();
    } catch (err) {
      console.error("Error al procesar el guardado de la solicitud:", err);
      Utils.showToast('Error al conectar con la base de datos', 'error');
    }
  },

  // 6. Visualización de detalles asíncrona
  async viewDetail(requestId) {
    try {
      const requests = await SupabaseClient.getRequests();
      const r = requests.find(item => item.id === requestId);
      if (!r) return;

      const workerName = r.worker_name || r.workerName;
      const employeeNumber = r.employee_number || r.employeeNumber;
      const startDate = r.start_date || r.startDate;
      const endDate = r.end_date || r.endDate;
      const workedDate = r.worked_date || r.workedDate;
      const swapDate = r.swap_date || r.swapDate;
      const capturedBy = r.captured_by || r.capturedBy;
      const captureDate = r.capture_date || r.captureDate;
      const authorizedBy = r.authorized_by || r.authorizedBy;
      const authorizationDate = r.authorization_date || r.authorizationDate;
      const authorizationComment = r.authorization_comment || r.authorizationComment;
      const immediateBoss = r.immediate_boss || r.immediateBoss;

      const body = `
        <div class="form-row">
          <div class="form-group"><label>Trabajador</label><p>${Utils.escapeHtml(workerName)} (${employeeNumber})</p></div>
          <div class="form-group"><label>Tipo</label><p>${Utils.getTypeBadge(r.type)}</p></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Periodo</label><p>${Utils.formatDate(startDate)} - ${Utils.formatDate(endDate)} (${r.days} días)</p></div>
          <div class="form-group"><label>Estatus</label><p>${Utils.getStatusBadge(r.status)}</p></div>
        </div>
        <div class="form-group"><label>Motivo</label><p>${Utils.escapeHtml(r.reason)}</p></div>
        ${r.observations ? `<div class="form-group"><label>Observaciones</label><p>${Utils.escapeHtml(r.observations)}</p></div>` : ''}
        ${r.type === 'cambio_dia' ? `
          <div class="form-row">
            <div class="form-group"><label>Fecha Trabajada</label><p>${Utils.formatDate(workedDate)}</p></div>
            <div class="form-group"><label>Fecha Cambio</label><p>${Utils.formatDate(swapDate)}</p></div>
          </div>
        ` : ''}
        <div class="form-row">
          <div class="form-group"><label>Capturó</label><p>${Utils.escapeHtml(capturedBy)} - ${Utils.formatDateTime(captureDate)}</p></div>
          <div class="form-group"><label>Autorizó</label><p>${authorizedBy ? Utils.escapeHtml(authorizedBy) + ' - ' + Utils.formatDateTime(authorizationDate) : 'Pendiente'}</p></div>
        </div>
        ${authorizationComment ? `<div class="form-group"><label>Comentario Autorización</label><p>${Utils.escapeHtml(authorizationComment)}</p></div>` : ''}
      `;

      Utils.openModal('Detalle de Solicitud', body, '<button class="btn btn-outline" onclick="Utils.closeModal()">Cerrar</button>');
    } catch (err) {
      console.error(err);
    }
  },

  // 7. Cancelar de forma asíncrona
  async cancelRequest(requestId) {
    if (!confirm('¿Cancelar esta solicitud?')) return;
    try {
      await window.supabaseClient
        .from('requests')
        .update({ status: 'cancelado' })
        .eq('id', requestId);

      if (typeof SupabaseClient.recalculateEconomicDays === 'function') {
        await SupabaseClient.recalculateEconomicDays();
      }

      Utils.showToast('Solicitud cancelada');
      this.renderTable();
      if (window.App && App.updateAlertBadge) App.updateAlertBadge();
    } catch (err) {
      console.error(err);
      Utils.showToast('Error al cancelar la solicitud', 'error');
    }
  }
};