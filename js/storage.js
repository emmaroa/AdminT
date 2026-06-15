/**
 * Capa de Almacenamiento de Datos - Utilidades de Sesión y Cálculos Locales (Versión Supabase)
 */
const Storage = {
  /**
   * Inicialización del entorno local (No genera semillas dinámicas, delegadas a Supabase)
   */
  init() {
    if (!localStorage.getItem(CONFIG.STORAGE_KEYS.INITIALIZED)) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.INITIALIZED, 'true');
    }
  },

  // --- Sesión de Usuario (Persistencia en Cliente) ---
  
  /**
   * Recupera los datos de la sesión activa
   * @returns {Object|null}
   */
  getSession() {
    const data = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSION);
    try {
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error("Error al leer la sesión del almacenamiento local:", e);
      return null;
    }
  },

  /**
   * Guarda o actualiza los datos de la sesión actual
   * @param {Object} sessionData 
   */
  saveSession(sessionData) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
  },

  /**
   * Elimina los datos de autenticación del almacenamiento local
   */
  clearSession() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.SESSION);
  },

  // --- Métodos Estadísticos y Filtros en Memoria ---

  /**
   * Filtra y calcula la sumatoria de días consumidos de un tipo específico para un trabajador
   * @param {Array} requestList - Listado de solicitudes descargado de Supabase
   * @param {string} workerId - Identificador del trabajador
   * @param {string} type - Tipo de incidencia ('economico', 'vacaciones', etc.)
   * @param {number} year - Año de ejercicio fiscal
   * @returns {number} Total de días acumulados
   */
  getUsedDaysFromPool(requestList, workerId, type, year = CONFIG.CURRENT_YEAR) {
    if (!Array.isArray(requestList)) return 0;
    
    return requestList
      .filter(r => {
        const rWorkerId = r.worker_id || r.workerId;
        const rStartDate = r.start_date || r.startDate;
        
        return rWorkerId === workerId &&
          r.type === type &&
          ['autorizado', 'pendiente'].includes(r.status) &&
          rStartDate && new Date(rStartDate).getFullYear() === year;
      })
      .reduce((sum, r) => sum + (parseInt(r.days) || 0), 0);
  },

  /**
   * Filtra las solicitudes pertenecientes a un trabajador ordenadas por fecha de captura
   * @param {Array} requestList - Listado de solicitudes descargado de Supabase
   * @param {string} workerId 
   * @returns {Array} Solicitudes ordenadas cronológicamente de forma descendente
   */
  getWorkerRequestsFromPool(requestList, workerId) {
    if (!Array.isArray(requestList)) return [];

    return requestList
      .filter(r => (r.worker_id || r.workerId) === workerId)
      .sort((a, b) => {
        const dateA = new Date(a.capture_date || a.captureDate || 0);
        const dateB = new Date(b.capture_date || b.captureDate || 0);
        return dateB - dateA;
      });
  },

  /**
   * Filtra las solicitudes pendientes, opcionalmente por jefe inmediato
   * @param {Array} requestList - Listado de solicitudes descargado de Supabase
   * @param {string|null} bossId - Identificador del jefe inmediato
   * @returns {Array} Solicitudes en estado pendiente
   */
  getPendingRequestsFromPool(requestList, bossId = null) {
    if (!Array.isArray(requestList)) return [];

    let pending = requestList.filter(r => r.status === 'pendiente');
    
    if (bossId) {
      pending = pending.filter(r => (r.immediate_boss_id || r.immediateBossId) === bossId);
    }
    return pending;
  }
};

// Inicializar la bandera de entorno al cargar el script
Storage.init();
