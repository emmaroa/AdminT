/**
 * Validaciones de negocio para solicitudes y personal (Versión Pura para Supabase)
 */
const Validators = {
  /**
   * Valida una solicitud completa antes de guardarla en el servidor
   * @param {Object} data - Datos del formulario de la solicitud
   * @param {Array} workersList - Listado actualizado de trabajadores descargado de Supabase
   * @param {Array} requestsList - Listado actualizado de solicitudes descargado de Supabase
   * @param {string|number|null} existingId - ID de la solicitud si es una edición
   */
  validateRequest(data, workersList, requestsList, existingId = null) {
    const errors = [];

    // Campos requeridos
    if (!data.workerId && !data.worker_id) errors.push('Debe seleccionar un trabajador');
    if (!data.type) errors.push('Debe seleccionar el tipo de solicitud');
    if (!data.startDate && !data.start_date) errors.push('Debe indicar la fecha inicial');
    if (!data.endDate && !data.end_date) errors.push('Debe indicar la fecha final');
    if (!data.reason || data.reason.trim().length < 3) errors.push('El motivo es requerido (mínimo 3 caracteres)');

    const targetWorkerId = data.worker_id || data.workerId;
    const targetStartDate = data.start_date || data.startDate;
    const targetEndDate = data.end_date || data.endDate;

    // Validar coherencia de fechas
    if (targetStartDate && targetEndDate) {
      const start = new Date(targetStartDate);
      const end = new Date(targetEndDate);
      if (end < start) {
        errors.push('La fecha final no puede ser anterior a la fecha inicial');
      }
    }

    // Validar estado del trabajador
    const worker = Array.isArray(workersList) 
      ? workersList.find(w => w.id === targetWorkerId) 
      : null;

    if (worker) {
      const isWorkerActive = worker.active ?? true;
      if (!isWorkerActive) {
        errors.push('El trabajador seleccionado está inactivo');
      }
    }

    // Validar traslapes de fechas operativas
    if (targetWorkerId && targetStartDate && targetEndDate && Array.isArray(requestsList)) {
      const overlap = this.checkDateOverlap(targetWorkerId, targetStartDate, targetEndDate, requestsList, existingId);
      if (overlap) {
        const overlapStart = overlap.start_date || overlap.startDate;
        const overlapEnd = overlap.end_date || overlap.endDate;
        errors.push(`Las fechas se traslapan con otra solicitud (${Utils.getTypeLabel(overlap.type)}, ${Utils.formatDate(overlapStart)} - ${Utils.formatDate(overlapEnd)})`);
      }
    }

    // Calcular días solicitados en el movimiento actual
    const calculatedDays = targetStartDate && targetEndDate ? Utils.calculateDays(targetStartDate, targetEndDate) : 0;
    const currentDays = parseInt(data.days) || calculatedDays;

    // Validaciones de límites por tipo de incidencia
    if (data.type === 'economico' && worker) {
      const used = Storage.getUsedDaysFromPool(requestsList, worker.id, 'economico');
      
      // Si estamos editando, descontamos los días previos de la misma solicitud para no duplicar el cálculo
      const previousRequest = existingId ? requestsList.find(r => r.id === existingId) : null;
      const previousDays = previousRequest ? (parseInt(previousRequest.days) || 0) : 0;
      
      const totalUsed = used - previousDays + currentDays;

      if (totalUsed > CONFIG.MAX_DIAS_ECONOMICOS) {
        const remaining = CONFIG.MAX_DIAS_ECONOMICOS - (used - previousDays);
        errors.push(`Excede el límite de días económicos. Disponibles: ${remaining >= 0 ? remaining : 0} de ${CONFIG.MAX_DIAS_ECONOMICOS}`);
      }
    }

    if (data.type === 'vacaciones' && worker) {
      const used = Storage.getUsedDaysFromPool(requestsList, worker.id, 'vacaciones');
      const maxVacationDays = parseInt(worker.vacation_days || worker.vacationDays) || 0;
      
      const previousRequest = existingId ? requestsList.find(r => r.id === existingId) : null;
      const previousDays = previousRequest ? (parseInt(previousRequest.days) || 0) : 0;
      
      const totalUsed = used - previousDays + currentDays;

      if (totalUsed > maxVacationDays) {
        const remaining = maxVacationDays - (used - previousDays);
        errors.push(`Excede los días de vacaciones disponibles. Disponibles: ${remaining >= 0 ? remaining : 0} de ${maxVacationDays}`);
      }
    }

    // Reglas específicas para Cambios de Día
    if (data.type === 'cambio_dia') {
      const hasBoss = data.immediate_boss_id || data.immediateBossId || data.immediate_boss || data.immediateBoss;
      if (!hasBoss) {
        errors.push('El cambio de día por operatividad requiere especificar el jefe inmediato');
      }
      if (!data.worked_date && !data.workedDate) {
        errors.push('Debe indicar la fecha en la que efectivamente se laboró');
      }
      if (!data.swap_date && !data.swapDate) {
        errors.push('Debe indicar la fecha de descanso que se tomará a cambio');
      }
    }

    // Reglas específicas para Incapacidades por Riesgo
    if (data.type === 'incapacidad_riesgo') {
      if (!data.observations || data.observations.trim().length < 5) {
        errors.push('La incapacidad por riesgo de trabajo requiere observaciones técnicas detalladas');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Verifica de forma síncrona si hay traslapes en un conjunto de datos en memoria
   */
  checkDateOverlap(workerId, startDate, endDate, requestsList, excludeId = null) {
    if (!Array.isArray(requestsList)) return null;

    const filteredRequests = requestsList.filter(r => {
      const rWorkerId = r.worker_id || r.workerId;
      return rWorkerId === workerId &&
        r.id !== excludeId &&
        !['rechazado', 'cancelado'].includes(r.status);
    });

    for (const req of filteredRequests) {
      const reqStart = req.start_date || req.startDate;
      const reqEnd = req.end_date || req.endDate;
      
      if (Utils.datesOverlap(startDate, endDate, reqStart, reqEnd)) {
        return req;
      }
    }
    return null;
  },

  /**
   * Valida la estructura de la ficha de un trabajador
   */
  validateWorker(data, workersList, existingId = null) {
    const errors = [];

    const fullName = data.full_name || data.fullName;
    const employeeNumber = data.employee_number || data.employeeNumber;

    if (!fullName || fullName.trim().length < 3) {
      errors.push('El nombre completo es requerido (mínimo 3 caracteres)');
    }
    if (!employeeNumber || employeeNumber.trim().length < 2) {
      errors.push('El número de empleado es requerido');
    }
    if (!data.area) errors.push('El área adscrita es requerida');
    if (!data.position) errors.push('El puesto del trabajador es requerido');

    // Validar unicidad del número de empleado en el pool inyectado
    if (Array.isArray(workersList) && employeeNumber) {
      const duplicate = workersList.find(w => {
        const wNum = w.employee_number || w.employeeNumber;
        return wNum === employeeNumber && w.id !== existingId;
      });
      if (duplicate) {
        errors.push('Ya existe un integrante registrado con ese número de empleado');
      }
    }

    const vacationDays = data.vacation_days !== undefined ? data.vacation_days : data.vacationDays;
    if (vacationDays !== undefined && (vacationDays < 0 || vacationDays > 365)) {
      errors.push('Los días de vacaciones configurados deben estar en un rango de 0 a 365');
    }

    return { 
      valid: errors.length === 0, 
      errors 
    };
  },

  /**
   * Procesa arreglos de datos remotos para calcular las alertas del sistema
   * @param {Array} workersList - Datos desde Supabase
   * @param {Array} requestsList - Datos desde Supabase
   * @returns {Array} Listado de objetos de alerta estructurados para UI
   */
  generateAlertsFromData(workersList, requestsList) {
    const alerts = [];
    if (!Array.isArray(workersList) || !Array.isArray(requestsList)) return alerts;

    const activeWorkers = workersList.filter(w => w.active ?? true);
    const year = CONFIG.CURRENT_YEAR;

    activeWorkers.forEach(worker => {
      const wName = worker.full_name || worker.fullName;
      const maxVacationDays = parseInt(worker.vacation_days || worker.vacationDays) || 0;
      
      const economicUsed = Storage.getUsedDaysFromPool(requestsList, worker.id, 'economico', year);
      const vacationUsed = Storage.getUsedDaysFromPool(requestsList, worker.id, 'vacaciones', year);

      // Alertas de días económicos
      if (economicUsed >= CONFIG.MAX_DIAS_ECONOMICOS) {
        alerts.push({
          type: 'danger',
          icon: '🚫',
          message: `${wName} ha agotado sus ${CONFIG.MAX_DIAS_ECONOMICOS} días económicos del año`,
          workerId: worker.id
        });
      } else if (economicUsed >= CONFIG.MAX_DIAS_ECONOMICOS - 2) {
        alerts.push({
          type: 'warning',
          icon: '⚠️',
          message: `${wName} está por alcanzar el límite de días económicos (${economicUsed}/${CONFIG.MAX_DIAS_ECONOMICOS})`,
          workerId: worker.id
        });
      }

      // Alertas de vacaciones
      if (vacationUsed >= maxVacationDays && maxVacationDays > 0) {
        alerts.push({
          type: 'danger',
          icon: '🏖️',
          message: `${wName} ha agotado sus días de vacaciones configurados (${maxVacationDays} días)`,
          workerId: worker.id
        });
      } else if (vacationUsed >= maxVacationDays - 2 && maxVacationDays > 0) {
        alerts.push({
          type: 'warning',
          icon: '⚠️',
          message: `${wName} tiene pocas vacaciones disponibles (${maxVacationDays - vacationUsed} de ${maxVacationDays})`,
          workerId: worker.id
        });
      }
    });

    // Contador de solicitudes pendientes globales
    const pending = requestsList.filter(r => r.status === 'pendiente');
    if (pending.length > 0) {
      alerts.push({
        type: 'info',
        icon: '📋',
        message: `Hay ${pending.length} solicitud(es) pendiente(s) de evaluación en el panel`,
        count: pending.length
      });
    }

    // Detección de incapacidades en curso
    const todayStr = new Date().toISOString().split('T')[0];
    const activeIncapacities = requestsList.filter(r => {
      const rStart = r.start_date || r.startDate;
      const rEnd = r.end_date || r.endDate;
      return ['incapacidad', 'incapacidad_riesgo'].includes(r.type) &&
        r.status === 'autorizado' &&
        rStart <= todayStr && rEnd >= todayStr;
    });

    if (activeIncapacities.length > 0) {
      alerts.push({
        type: 'warning',
        icon: '🏥',
        message: `Hay ${activeIncapacities.length} incapacidad(es) médica(s) activa(s) el día de hoy`,
        count: activeIncapacities.length
      });
    }

    return alerts;
  },

  /**
   * Conserva compatibilidad con llamadas tradicionales de la app que no inyectan dependencias
   * @deprecated Utilizar generateAlertsFromData pasándole los arreglos desde los módulos asíncronos
   */
  generateAlerts() {
    if (window.App && Array.isArray(App.alerts) && App.alerts.length > 0) {
      return App.alerts;
    }
    return [];
  }
};