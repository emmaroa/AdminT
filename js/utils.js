/**
 * Utilidades generales del sistema (Versión Supabase)
 */
const Utils = {
  /**
   * Genera un ID único (Útil para elementos temporales de UI)
   */
  generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Formatea fecha ISO a formato legible
   */
  formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  /**
   * Formatea fecha y hora
   */
  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  },

  /**
   * Calcula días entre dos fechas (inclusive)
   */
  calculateDays(startDate, endDate) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + 1 : 0;
  },

  /**
   * Verifica si dos rangos de fechas se traslapan
   */
  datesOverlap(start1, end1, start2, end2) {
    const s1 = new Date(start1);
    const e1 = new Date(end1);
    const s2 = new Date(start2);
    const e2 = new Date(end2);
    return s1 <= e2 && s2 <= e1;
  },

  /**
   * Obtiene nombre del mes
   */
  getMonthName(month) {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[month];
  },

  /**
   * Obtiene etiqueta de tipo de solicitud
   */
  getTypeLabel(type) {
    return CONFIG.REQUEST_TYPES[type]?.label || type;
  },

  /**
   * Obtiene badge HTML de tipo
   */
  getTypeBadge(type) {
    const badgeClass = {
      economico: 'badge-economico',
      vacaciones: 'badge-vacaciones',
      incapacidad: 'badge-incapacidad',
      incapacidad_riesgo: 'badge-incapacidad-riesgo',
      cambio_dia: 'badge-cambio-dia'
    }[type] || '';
    return `<span class="badge ${badgeClass}">${this.getTypeLabel(type)}</span>`;
  },

  /**
   * Obtiene badge HTML de estatus
   */
  getStatusBadge(status) {
    const info = CONFIG.STATUS[status];
    if (!info) return status;
    return `<span class="badge ${info.class}">${info.label}</span>`;
  },

  /**
   * Muestra notificación toast en la interfaz
   */
  showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  },

  /**
   * Abre modal genérico
   */
  openModal(title, bodyHTML, footerHTML = '', large = false) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHTML;
    document.getElementById('modalFooter').innerHTML = footerHTML;
    const modal = document.getElementById('modalContainer');
    if (modal) modal.classList.toggle('modal-lg', large);
    document.getElementById('modalOverlay').classList.add('active');
  },

  /**
   * Cierra modal
   */
  closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
  },

  /**
   * Escapa HTML para prevenir vulnerabilidades XSS
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Filtra un pool de solicitudes local en base a criterios (Adaptado para propiedades de Supabase)
   */
  filterRequests(requests, filters) {
    if (!Array.isArray(requests)) return [];
    
    return requests.filter(r => {
      const rWorkerId = r.worker_id || r.workerId;
      const rStartDate = r.start_date || r.startDate;
      const rEndDate = r.end_date || r.endDate;
      const rImmediateBossId = r.immediate_boss_id || r.immediateBossId;

      if (filters.workerId && rWorkerId !== filters.workerId) return false;
      if (filters.type && r.type !== filters.type) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.area && r.area !== filters.area) return false;
      if (filters.bossId && rImmediateBossId !== filters.bossId) return false;

      if (filters.startDate && filters.endDate) {
        const filterStart = new Date(filters.startDate);
        const filterEnd = new Date(filters.endDate);
        const reqStart = new Date(rStartDate);
        const reqEnd = new Date(rEndDate);
        if (reqEnd < filterStart || reqStart > filterEnd) return false;
      }

      if (filters.year && rStartDate) {
        const reqYear = new Date(rStartDate).getFullYear();
        if (reqYear !== parseInt(filters.year)) return false;
      }

      if (filters.month !== undefined && filters.month !== '' && rStartDate) {
        const reqMonth = new Date(rStartDate).getMonth();
        if (reqMonth !== parseInt(filters.month)) return false;
      }

      return true;
    });
  },

  /**
   * Obtiene áreas únicas procesando un listado de trabajadores inyectado
   */
  getUniqueAreas(workersList) {
    if (!Array.isArray(workersList)) return [];
    return [...new Set(workersList.map(w => w.area).filter(Boolean))].sort();
  },

  /**
   * Obtiene jefes inmediatos activos procesando un listado de trabajadores inyectado
   */
  getUniqueBosses(workersList) {
    if (!Array.isArray(workersList)) return [];
    return workersList
      .filter(w => w.active ?? true)
      .map(w => ({ id: w.id, name: w.full_name || w.fullName }));
  },

  /**
   * Exporta datos a Excel usando SheetJS
   */
  exportToExcel(data, filename, sheetName = 'Reporte') {
    if (typeof XLSX === 'undefined') {
      this.showToast('Librería Excel no disponible', 'error');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XXLSX.utils.book_append_sheet(wb, ws, sheetName);
    XXLSX.writeFile(wb, `${filename}.xlsx`);
    this.showToast('Archivo Excel descargado');
  },

  /**
   * Exporta tabla a PDF usando jsPDF
   */
  exportToPDF(title, headers, rows, filename, meta = {}) {
    if (typeof jspdf === 'undefined') {
      this.showToast('Librería PDF no disponible', 'error');
      return;
    }
    const { jsPDF } = jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    doc.setFillColor(26, 35, 50);
    doc.rect(0, 0, 297, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(CONFIG.APP_NAME, 148, 12, { align: 'center' });
    doc.setFontSize(10);
    doc.text(title, 148, 20, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    let yPos = 32;

    if (meta.dateRange) {
      doc.text(`Periodo: ${meta.dateRange}`, 14, yPos);
      yPos += 6;
    }
    doc.text(`Fecha de impresión: ${new Date().toLocaleDateString('es-MX')}`, 14, yPos);
    yPos += 6;
    if (meta.summary) {
      doc.text(`Total registros: ${meta.summary}`, 14, yPos);
      yPos += 8;
    }

    doc.autoTable({
      startY: yPos,
      head: [headers],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [252, 113, 43], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [244, 246, 249] }
    });

    doc.save(`${filename}.pdf`);
    this.showToast('Archivo PDF descargado');
  },

  /**
   * Transforma una solicitud a un objeto plano estructurado para reportes
   */
  requestToReportRow(r) {
    return {
      'No. Empleado': r.employee_number || r.employeeNumber || '',
      'Trabajador': r.worker_name || r.workerName || '',
      'Área': r.area || '',
      'Tipo': this.getTypeLabel(r.type),
      'Fecha Inicial': this.formatDate(r.start_date || r.startDate),
      'Fecha Final': this.formatDate(r.end_date || r.endDate),
      'Días': parseInt(r.days) || 0,
      'Motivo': r.reason || '',
      'Estatus': CONFIG.STATUS[r.status]?.label || r.status,
      'Jefe Inmediato': r.immediate_boss || r.immediateBoss || '',
      'Observaciones': r.observations || ''
    };
  }
};
