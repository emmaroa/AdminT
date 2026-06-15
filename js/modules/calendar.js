/**
 * Módulo Calendario - Vista visual de solicitudes por mes (Versión Supabase)
 */
const CalendarModule = {
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  cachedRequests: [], // Almacén en memoria para optimizar los cambios de mes y filtros

  // Renderizado inicial asíncrono para poblar el filtro de trabajadores desde Supabase
  async render() {
    let activeWorkers = [];
    try {
      const allWorkers = await SupabaseClient.getWorkers();
      activeWorkers = allWorkers.filter(w => w.active ?? true);
      activeWorkers.sort((a, b) => {
        const nameA = a.full_name || a.fullName || '';
        const nameB = b.full_name || b.fullName || '';
        return nameA.localeCompare(nameB);
      });
    } catch (err) {
      console.error("Error al obtener trabajadores para el calendario:", err);
    }

    return `
      <div class="card">
        <div class="card-body">
          <div class="calendar-toolbar no-print">
            <div class="calendar-nav">
              <button class="btn btn-outline btn-sm" id="calPrev">◀</button>
              <h3 id="calTitle">${Utils.getMonthName(this.currentMonth)} ${this.currentYear}</h3>
              <button class="btn btn-outline btn-sm" id="calNext">▶</button>
            </div>
            <div class="filters-bar" style="margin:0; padding:0.5rem; background:transparent;">
              <div class="form-group">
                <label>Trabajador</label>
                <select class="form-control" id="calWorkerFilter">
                  <option value="">Todos</option>
                  ${activeWorkers.map(w => {
                    const fullName = w.full_name || w.fullName;
                    return `<option value="${w.id}">${Utils.escapeHtml(fullName)}</option>`;
                  }).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Tipo</label>
                <select class="form-control" id="calTypeFilter">
                  <option value="">Todos</option>
                  ${Object.entries(CONFIG.REQUEST_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Estatus</label>
                <select class="form-control" id="calStatusFilter">
                  <option value="">Todos</option>
                  ${Object.entries(CONFIG.STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>

          <div class="calendar-legend">
            ${Object.entries(CONFIG.REQUEST_TYPES).map(([k, v]) => `
              <div class="legend-item">
                <div class="legend-dot" style="background:${v.color}"></div>
                ${v.label}
              </div>
            `).join('')}
          </div>

          <div class="calendar-grid" id="calendarGrid">
            <div class="text-center p-3" style="grid-column: 1 / -1;">⏳ Cargando calendario...</div>
          </div>
        </div>
      </div>
    `;
  },

  async init() {
    try {
      // Descarga inicial de solicitudes desde el servidor
      const rawRequests = await SupabaseClient.getRequests();
      
      // Normalización y mapeo seguro de datos
      this.cachedRequests = rawRequests.map(r => ({
        id: r.id,
        workerId: r.worker_id || r.workerId,
        workerName: r.worker_name || r.workerName || '',
        type: r.type,
        status: r.status,
        startDate: r.start_date || r.startDate,
        endDate: r.end_date || r.endDate,
        days: parseInt(r.days) || 0
      }));

      this.renderCalendar();
    } catch (err) {
      console.error("Error al cargar eventos del calendario:", err);
      const grid = document.getElementById('calendarGrid');
      if (grid) grid.innerHTML = '<div class="text-error" style="grid-column: 1 / -1;">Error al sincronizar el calendario con el servidor</div>';
    }

    // Eventos de navegación mensual
    document.getElementById('calPrev').addEventListener('click', () => {
      this.currentMonth--;
      if (this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; }
      this.renderCalendar();
    });

    document.getElementById('calNext').addEventListener('click', () => {
      this.currentMonth++;
      if (this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; }
      this.renderCalendar();
    });

    // Eventos de filtros reactivos en memoria
    ['calWorkerFilter', 'calTypeFilter', 'calStatusFilter'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => this.renderCalendar());
    });
  },

  // Filtrado y procesamiento local basado en la colección cacheada
  getFilteredEvents() {
    const workerFilter = document.getElementById('calWorkerFilter')?.value;
    const typeFilter = document.getElementById('calTypeFilter')?.value;
    const statusFilter = document.getElementById('calStatusFilter')?.value;

    return this.cachedRequests.filter(r => {
      // Ignorar solicitudes canceladas o rechazadas
      if (['rechazado', 'cancelado'].includes(r.status)) return false;

      // Filtrado por selectores de la barra de herramientas
      if (workerFilter && r.workerId !== workerFilter) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;

      // Intersección de fechas del evento con el año y mes en visualización
      if (!r.startDate || !r.endDate) return false;
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      
      const firstOfVisualMonth = new Date(this.currentYear, this.currentMonth, 1);
      const lastOfVisualMonth = new Date(this.currentYear, this.currentMonth + 1, 0);

      return (start <= lastOfVisualMonth && end >= firstOfVisualMonth);
    });
  },

  renderCalendar() {
    const titleEl = document.getElementById('calTitle');
    const gridEl = document.getElementById('calendarGrid');
    if (!titleEl || !gridEl) return;

    titleEl.textContent = `${Utils.getMonthName(this.currentMonth)} ${this.currentYear}`;

    const events = this.getFilteredEvents();
    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const today = new Date();

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    let html = dayNames.map(d => `<div class="calendar-header-day">${d}</div>`).join('');

    // Rellenar días del mes anterior
    const prevMonthDays = new Date(this.currentYear, this.currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      html += `<div class="calendar-day other-month"><div class="calendar-day-number">${prevMonthDays - i}</div></div>`;
    }

    // Pintar días del mes actual con sus respectivos eventos asignados
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = today.getFullYear() === this.currentYear && today.getMonth() === this.currentMonth && today.getDate() === day;

      const dayEvents = events.filter(e => dateStr >= e.startDate && dateStr <= e.endDate);

      html += `
        <div class="calendar-day ${isToday ? 'today' : ''}">
          <div class="calendar-day-number">${day}</div>
          ${dayEvents.map(e => {
            const shortName = e.workerName ? e.workerName.split(' ')[0] : 'Trabajador';
            const typeLabel = CONFIG.REQUEST_TYPES[e.type]?.label || e.type;
            return `
              <div class="calendar-event ${e.type}" 
                   title="${Utils.escapeHtml(e.workerName)} - ${Utils.escapeHtml(typeLabel)}" 
                   onclick="RequestsModule.viewDetail('${e.id}')">
                ${Utils.escapeHtml(shortName)}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Rellenar celdas restantes para completar la última semana del grid
    const totalCells = startDayOfWeek + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      html += `<div class="calendar-day other-month"><div class="calendar-day-number">${i}</div></div>`;
    }

    gridEl.innerHTML = html;
  }
};
