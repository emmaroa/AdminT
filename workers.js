/**
 * Módulo Trabajadores - CRUD del catálogo de personal (Versión Supabase)
 */
const WorkersModule = {
  render() {
    const canEdit = Auth.canManageWorkers();
    return `
      <div class="card">
        <div class="card-header">
          <h3>👥 Catálogo de Trabajadores</h3>
          ${canEdit ? '<button class="btn btn-primary btn-sm" id="btnAddWorker">+ Nuevo Trabajador</button>' : ''}
        </div>
        <div class="card-body">
          <div class="filters-bar no-print">
            <div class="form-group">
              <label>Buscar</label>
              <input type="text" class="form-control" id="workerSearch" placeholder="Nombre, número o área...">
            </div>
            <div class="form-group">
              <label>Estatus</label>
              <select class="form-control" id="workerStatusFilter">
                <option value="">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </div>
            <div class="form-group">
              <label>Área</label>
              <select class="form-control" id="workerAreaFilter">
                <option value="">Todas</option>
                ${Utils.getUniqueAreas().map(a => `<option value="${a}">${a}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="data-table" id="workersTable">
              <thead>
                <tr>
                  <th>No. Empleado</th>
                  <th>Nombre</th>
                  <th>Área</th>
                  <th>Puesto</th>
                  <th>Jefe Inmediato</th>
                  <th>Vacaciones</th>
                  <th>Económicos</th>
                  <th>Estatus</th>
                  ${canEdit ? '<th>Acciones</th>' : ''}
                </tr>
              </thead>
              <tbody id="workersTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.renderTable();
    document.getElementById('workerSearch')?.addEventListener('input', () => this.renderTable());
    document.getElementById('workerStatusFilter')?.addEventListener('change', () => this.renderTable());
    document.getElementById('workerAreaFilter')?.addEventListener('change', () => this.renderTable());
    document.getElementById('btnAddWorker')?.addEventListener('click', () => this.showForm());
  },

  // 1. Convertido a async para esperar los datos de la base de datos
  async renderTable() {
    const search = document.getElementById('workerSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('workerStatusFilter')?.value || '';
    const areaFilter = document.getElementById('workerAreaFilter')?.value || '';
    const canEdit = Auth.canManageWorkers();
    const tbody = document.getElementById('workersTableBody');

    try {
      // Agregamos el await correspondiente
      let workers = await SupabaseClient.getWorkers();

      // Mapeo de nombres de columnas de Supabase a la estructura de tu frontend
      // Nota: Si en tu base de datos las columnas se llaman 'full_name' y 'employee_number', 
      // este mapeo normaliza los objetos para que no tengas que cambiar tu HTML.
      workers = workers.map(w => ({
        id: w.id,
        fullName: w.full_name || w.fullName,
        employeeNumber: w.employee_number || w.employeeNumber,
        area: w.area,
        position: w.position,
        immediateBoss: w.immediate_boss || w.immediateBoss,
        immediateBossId: w.immediate_boss_id || w.immediateBossId,
        vacationDays: w.vacation_days || w.vacationDays || 0,
        active: w.active
      }));

      // Filtros aplicados en memoria
      if (search) {
        workers = workers.filter(w =>
          w.fullName.toLowerCase().includes(search) ||
          w.employeeNumber.toLowerCase().includes(search) ||
          w.area.toLowerCase().includes(search)
        );
      }
      if (statusFilter === 'active') workers = workers.filter(w => w.active);
      if (statusFilter === 'inactive') workers = workers.filter(w => !w.active);
      if (areaFilter) workers = workers.filter(w => w.area === areaFilter);

      if (workers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No se encontraron trabajadores</td></tr>';
        return;
      }

      // Renderizado asincrónico por las consultas secundarias de días usados
      const rowsPromises = workers.map(async (w) => {
        // Obtenemos los días asíncronamente desde Supabase si existen las funciones
        const economicUsed = typeof SupabaseClient.getUsedDays === 'function' 
          ? await SupabaseClient.getUsedDays(w.id, 'economico') 
          : 0;
        const vacationUsed = typeof SupabaseClient.getUsedDays === 'function' 
          ? await SupabaseClient.getUsedDays(w.id, 'vacaciones') 
          : 0;

        const economicPercent = (economicUsed / CONFIG.MAX_DIAS_ECONOMICOS) * 100;
        const vacationPercent = w.vacationDays > 0 ? (vacationUsed / w.vacationDays) * 100 : 0;

        return `
          <tr>
            <td><strong>${Utils.escapeHtml(w.employeeNumber)}</strong></td>
            <td>${Utils.escapeHtml(w.fullName)}</td>
            <td>${Utils.escapeHtml(w.area)}</td>
            <td>${Utils.escapeHtml(w.position)}</td>
            <td>${Utils.escapeHtml(w.immediateBoss || '-')}</td>
            <td>
              ${vacationUsed}/${w.vacationDays}
              <div class="progress-bar mt-1"><div class="progress-fill ${vacationPercent > 80 ? 'danger' : 'primary'}" style="width:${vacationPercent}%"></div></div>
            </td>
            <td>
              ${economicUsed}/${CONFIG.MAX_DIAS_ECONOMICOS}
              <div class="progress-bar mt-1"><div class="progress-fill ${economicPercent > 80 ? 'danger' : economicPercent > 60 ? 'warning' : 'success'}" style="width:${economicPercent}%"></div></div>
            </td>
            <td>${w.active ? '<span class="badge badge-autorizado">Activo</span>' : '<span class="badge badge-cancelado">Inactivo</span>'}</td>
            ${canEdit ? `
              <td class="actions">
                <button class="btn btn-secondary btn-sm" onclick="WorkersModule.showForm('${w.id}')">✏️</button>
                <button class="btn btn-outline btn-sm" onclick="WorkersModule.toggleStatus('${w.id}')">${w.active ? '🚫' : '✅'}</button>
                <button class="btn btn-danger btn-sm" onclick="WorkersModule.deleteWorker('${w.id}')">🗑️</button>
              </td>
            ` : ''}
          </tr>
        `;
      });

      const rowsHtml = await Promise.all(rowsPromises);
      tbody.innerHTML = rowsHtml.join('');

    } catch (err) {
      console.error("Error al renderizar tabla de trabajadores:", err);
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error al conectar con el servidor</td></tr>';
    }
  },

  // 2. Convertido a async para traer jefes y detalles del trabajador a editar
  async showForm(workerId = null) {
    try {
      let worker = null;
      if (workerId) {
        // Reemplazar por método asíncrono en SupabaseClient si existe, o buscar del listado completo
        const workers = await SupabaseClient.getWorkers();
        worker = workers.find(w => w.id === workerId);
        if (worker) {
          worker.fullName = worker.full_name || worker.fullName;
          worker.employeeNumber = worker.employee_number || worker.employeeNumber;
          worker.immediateBossId = worker.immediate_boss_id || worker.immediateBossId;
          worker.vacationDays = worker.vacation_days || worker.vacationDays;
        }
      }

      const allWorkers = await SupabaseClient.getWorkers();
      const bosses = allWorkers.filter(w => w.id !== workerId && (w.active || w.active === undefined));
      const isEdit = !!worker;

      const body = `
        <form id="workerForm">
          <div class="form-row">
            <div class="form-group">
              <label>Nombre Completo <span class="required">*</span></label>
              <input type="text" class="form-control" name="fullName" value="${Utils.escapeHtml(worker?.fullName || '')}" required>
            </div>
            <div class="form-group">
              <label>No. Empleado <span class="required">*</span></label>
              <input type="text" class="form-control" name="employeeNumber" value="${Utils.escapeHtml(worker?.employeeNumber || '')}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Área <span class="required">*</span></label>
              <input type="text" class="form-control" name="area" value="${Utils.escapeHtml(worker?.area || '')}" required list="areasList">
              <datalist id="areasList">${Utils.getUniqueAreas().map(a => `<option value="${a}">`).join('')}</datalist>
            </div>
            <div class="form-group">
              <label>Puesto <span class="required">*</span></label>
              <input type="text" class="form-control" name="position" value="${Utils.escapeHtml(worker?.position || '')}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Jefe Inmediato</label>
              <select class="form-control" name="immediateBossId">
                <option value="">-- Seleccionar --</option>
                ${bosses.map(b => `<option value="${b.id}" ${worker?.immediateBossId === b.id ? 'selected' : ''}>${Utils.escapeHtml(b.full_name || b.fullName)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Estatus</label>
              <select class="form-control" name="active">
                <option value="true" ${worker?.active !== false ? 'selected' : ''}>Activo</option>
                <option value="false" ${worker?.active === false ? 'selected' : ''}>Inactivo</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Días de Vacaciones Asignados</label>
              <input type="number" class="form-control" name="vacationDays" min="0" max="365" value="${worker?.vacationDays ?? 12}">
            </div>
            <div class="form-group">
              <label>Días Económicos por Año</label>
              <input type="number" class="form-control" name="economicDays" min="0" max="10" value="${worker?.economicDays ?? CONFIG.MAX_DIAS_ECONOMICOS}" readonly>
              <div class="form-hint">Máximo institucional: ${CONFIG.MAX_DIAS_ECONOMICOS} días</div>
            </div>
          </div>
          <div id="workerFormErrors"></div>
        </form>
      `;

      const footer = `
        <button class="btn btn-outline" onclick="Utils.closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="btnSaveWorker">${isEdit ? 'Actualizar' : 'Guardar'}</button>
      `;

      Utils.openModal(isEdit ? 'Editar Trabajador' : 'Nuevo Trabajador', body, footer);

      document.getElementById('btnSaveWorker').addEventListener('click', () => this.saveWorker(workerId));
    } catch (err) {
      console.error("Error al abrir formulario:", err);
    }
  },

  // 3. Convertido a async para guardar/actualizar en Supabase de verdad
  async saveWorker(workerId = null) {
    const form = document.getElementById('workerForm');
    const formData = new FormData(form);
    const bossId = formData.get('immediateBossId');
    
    let bossName = '';
    if (bossId) {
      const allWorkers = await SupabaseClient.getWorkers();
      const boss = allWorkers.find(w => w.id === bossId);
      if (boss) bossName = boss.full_name || boss.fullName;
    }

    // Estructura adaptada tanto a snake_case (base de datos) como a tu frontend
    const data = {
      full_name: formData.get('fullName').trim(),
      employee_number: formData.get('employeeNumber').trim(),
      area: formData.get('area').trim(),
      position: formData.get('position').trim(),
      immediate_boss_id: bossId || null,
      immediate_boss: bossName,
      active: formData.get('active') === 'true',
      vacation_days: parseInt(formData.get('vacationDays')) || 0,
      economic_days: CONFIG.MAX_DIAS_ECONOMICOS
    };

    // Objeto temporal para la validación tradicional del frontend
    const validationData = {
      fullName: data.full_name,
      employeeNumber: data.employee_number,
      area: data.area,
      position: data.position,
      immediateBossId: data.immediate_boss_id,
      immediateBoss: data.immediate_boss,
      active: data.active,
      vacationDays: data.vacation_days,
      economicDays: data.economic_days
    };

    const validation = Validators.validateWorker(validationData, workerId);
    if (!validation.valid) {
      document.getElementById('workerFormErrors').innerHTML = validation.errors.map(e =>
        `<div class="form-error">${e}</div>`
      ).join('');
      return;
    }

    try {
      if (workerId) {
        // Asegúrate de definir updateWorker en js/supabase-client.js usando .update()
        if (typeof SupabaseClient.updateWorker === 'function') {
          await SupabaseClient.updateWorker(workerId, data);
        }
        Utils.showToast('Trabajador actualizado');
      } {
        // Asegúrate de definir addWorker o createWorker en js/supabase-client.js usando .insert()
        if (typeof SupabaseClient.addWorker === 'function') {
          await SupabaseClient.addWorker(data);
        } else if (typeof SupabaseClient.createRequest === 'function') { 
          // Ajustado según los métodos visibles en tu cliente anterior
          await window.supabaseClient.from('workers').insert([data]);
        }
        Utils.showToast('Trabajador registrado');
      }

      Utils.closeModal();
      this.renderTable();
      if (window.App && App.updateAlertBadge) App.updateAlertBadge();
    } catch (err) {
      console.error("Error al procesar el guardado:", err);
      Utils.showToast('Error al guardar en la base de datos', 'error');
    }
  },

  // 4. Cambiar estatus asíncronamente
  async toggleStatus(workerId) {
    try {
      const workers = await SupabaseClient.getWorkers();
      const worker = workers.find(w => w.id === workerId);
      if (!worker) return;

      const currentActive = worker.active;
      
      await window.supabaseClient
        .from('workers')
        .update({ active: !currentActive })
        .eq('id', workerId);

      Utils.showToast(`Trabajador ${currentActive ? 'desactivado' : 'activado'}`);
      this.renderTable();
    } catch (err) {
      console.error(err);
    }
  },

  // 5. Eliminar registro de forma asíncrona
  async deleteWorker(workerId) {
    if (!confirm('¿Está seguro de eliminar este trabajador? Esta acción no se puede deshacer.')) return;
    try {
      await window.supabaseClient
        .from('workers')
        .delete()
        .eq('id', workerId);

      Utils.showToast('Trabajador eliminado');
      this.renderTable();
    } catch (err) {
      console.error(err);
      Utils.showToast('No se pudo eliminar el registro', 'error');
    }
  }
};