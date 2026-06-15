/**
 * Cliente Supabase - Implementación nativa basada en el Esquema SQL de Producción
 */
const SupabaseClient = {
  client: null,

  /**
   * Inicializa la conexión remota con el SDK de Supabase
   */
  init() {
    if (!CONFIG.SUPABASE.ENABLED || !CONFIG.SUPABASE.URL || !CONFIG.SUPABASE.ANON_KEY) {
      console.info('[Supabase] Modo localStorage activo por falta de credenciales.');
      return false;
    }

    if (typeof supabase === 'undefined') {
      console.error('[Supabase] SDK de Supabase no detectado en el DOM global.');
      return false;
    }

    this.client = supabase.createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.ANON_KEY);
    console.info('[Supabase] Conexión establecida con el motor relacional.');
    return true;
  },

  // --- CONTROL DE ACCESO (TABLA: users) ---

  /**
   * Obtiene todos los usuarios y mapea su relación con trabajadores si existe
   */
  async getUsers() {
    if (!this.client) return Storage.getUsers();
    
    const { data, error } = await this.client
      .from('users')
      .select('id, username, password:password_hash, name:full_name, role, active, workerId:worker_id');

    if (error) {
      console.error('[Supabase] Error al consultar usuarios:', error.message);
      throw error;
    }
    return data || [];
  },

  // --- GESTIÓN DE PLANTILLA (TABLA: workers & VISTAS) ---

  /**
   * Recupera los trabajadores cruzando los límites calculados desde las vistas SQL
   */
  async getWorkers() {
    if (!this.client) return Storage.getWorkers();

    // Consultamos los datos base del trabajador
    const { data: workers, error: wError } = await this.client
      .from('workers')
      .select('*')
      .order('full_name', { ascending: true });

    if (wError) {
      console.error('[Supabase] Error al mapear workers:', wError.message);
      throw wError;
    }

    // Consultamos el saldo del año en curso desde las vistas nativas
    const { data: econUsage } = await this.client.from('v_economic_days_usage').select('*');
    const { data: vacUsage } = await this.client.from('v_vacation_days_usage').select('*');

    // Homologamos la respuesta al formato camelCase que la UI de la aplicación espera
    return workers.map(w => {
      const econ = econUsage?.find(e => e.worker_id === w.id);
      const vac = vacUsage?.find(v => v.worker_id === w.id);

      return {
        id: w.id,
        employeeNumber: w.employee_number,
        fullName: w.full_name,
        area: w.area,
        position: w.position,
        immediateBossId: w.immediate_boss_id,
        immediateBoss: w.immediate_boss_name,
        active: w.active,
        vacationDays: w.vacation_days,
        economicDays: w.economic_days,
        economicDaysUsed: econ ? econ.used_days : 0,
        vacationDaysRemaining: vac ? vac.remaining_days : w.vacation_days
      };
    });
  },

  /**
   * Almacena una nueva ficha de personal transformando los campos al formato snake_case del esquema
   */
  async insertWorker(workerData) {
    if (!this.client) return Storage.addWorker(workerData);

    const dbPayload = {
      employee_number: workerData.employeeNumber,
      full_name: workerData.fullName,
      area: workerData.area,
      position: workerData.position,
      immediate_boss_id: workerData.immediateBossId || null,
      immediate_boss_name: workerData.immediateBoss || null,
      active: workerData.active ?? true,
      vacation_days: parseInt(workerData.vacationDays) || 12,
      economic_days: parseInt(workerData.economicDays) || 9
    };

    const { data, error } = await this.client
      .from('workers')
      .insert([dbPayload])
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  },

  /**
   * Modifica los datos de un trabajador por su ID único (UUID)
   */
  async updateWorker(workerId, workerData) {
    if (!this.client) return Storage.updateWorker(workerId, workerData);

    const dbPayload = {};
    if (workerData.employeeNumber !== undefined) dbPayload.employee_number = workerData.employeeNumber;
    if (workerData.fullName !== undefined) dbPayload.full_name = workerData.fullName;
    if (workerData.area !== undefined) dbPayload.area = workerData.area;
    if (workerData.position !== undefined) dbPayload.position = workerData.position;
    if (workerData.immediateBossId !== undefined) dbPayload.immediate_boss_id = workerData.immediateBossId;
    if (workerData.immediateBoss !== undefined) dbPayload.immediate_boss_name = workerData.immediateBoss;
    if (workerData.active !== undefined) dbPayload.active = workerData.active;
    if (workerData.vacationDays !== undefined) dbPayload.vacation_days = parseInt(workerData.vacationDays);
    if (workerData.economicDays !== undefined) dbPayload.economic_days = parseInt(workerData.economicDays);

    const { data, error } = await this.client
      .from('workers')
      .update(dbPayload)
      .eq('id', workerId)
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  },

  // --- CONTROL DE INCIDENCIAS (TABLA: requests & VISTAS) ---

  /**
   * Obtiene y normaliza las solicitudes del servidor aplicando filtros opcionales
   */
  async getRequests(filters = {}) {
    if (!this.client) return Storage.getRequests();

    let query = this.client.from('requests').select('*');

    if (filters.workerId) query = query.eq('worker_id', filters.workerId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.bossId) query = query.eq('immediate_boss_id', filters.bossId);

    const { data, error } = await query.order('capture_date', { ascending: false });

    if (error) {
      console.error('[Supabase] Error al consultar histórico de solicitudes:', error.message);
      throw error;
    }

    // Conversión de propiedades para preservar la compatibilidad con el renderizador UI de la App
    return (data || []).map(r => ({
      id: r.id,
      workerId: r.worker_id,
      workerName: r.worker_name,
      employeeNumber: r.employee_number,
      area: r.area,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      days: r.days,
      reason: r.reason,
      observations: r.observations,
      immediateBoss: r.immediate_boss_name,
      immediateBossId: r.immediate_boss_id,
      status: r.status,
      document: r.document,
      workedDate: r.worked_date,
      swapDate: r.swap_date,
      capturedBy: r.captured_by_name,
      capturedById: r.captured_by_id,
      captureDate: r.capture_date,
      authorizedBy: r.authorized_by_name,
      authorizedById: r.authorized_by_id,
      authorizationDate: r.authorization_date,
      authorizationComment: r.authorization_comment
    }));
  },

  /**
   * Registra una nueva solicitud convirtiendo la estructura a la semántica del motor SQL
   */
  async insertRequest(requestData) {
    if (!this.client) return Storage.addRequest(requestData);

    const dbPayload = {
      worker_id: requestData.workerId,
      worker_name: requestData.workerName,
      employee_number: requestData.employeeNumber,
      area: requestData.area,
      type: requestData.type,
      start_date: requestData.startDate,
      end_date: requestData.endDate,
      days: parseInt(requestData.days) || Utils.calculateDays(requestData.startDate, requestData.endDate),
      reason: requestData.reason,
      observations: requestData.observations || null,
      immediate_boss_id: requestData.immediateBossId || null,
      immediate_boss_name: requestData.immediateBoss || null,
      status: requestData.status || 'pendiente',
      document: requestData.document || null,
      worked_date: requestData.workedDate || null,
      swap_date: requestData.swapDate || null,
      captured_by_id: requestData.capturedById || null,
      captured_by_name: requestData.capturedBy || null
    };

    const { data, error } = await this.client
      .from('requests')
      .insert([dbPayload])
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  },

  /**
   * Actualiza estados, cancelaciones o firmas digitales de autorización sobre una solicitud
   */
  async updateRequest(requestId, requestData) {
    if (!this.client) return Storage.updateRequest(requestId, requestData);

    const dbPayload = {};
    if (requestData.status !== undefined) dbPayload.status = requestData.status;
    if (requestData.observations !== undefined) dbPayload.observations = requestData.observations;
    if (requestData.authorizedById !== undefined) dbPayload.authorized_by_id = requestData.authorizedById;
    if (requestData.authorizedBy !== undefined) dbPayload.authorized_by_name = requestData.authorizedBy;
    if (requestData.authorizationComment !== undefined) dbPayload.authorization_comment = requestData.authorizationComment;
    
    // Si se autoriza o rechaza en este momento, estampamos la marca de tiempo exacta del servidor
    if (requestData.status && requestData.status !== 'pendiente') {
      dbPayload.authorization_date = new Date().toISOString();
    }

    const { data, error } = await this.client
      .from('requests')
      .update(dbPayload)
      .eq('id', requestId)
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  },

  /**
   * Invoca de forma remota la función PL/pgSQL para validar traslapes de tiempo reales
   */
  async rpcCheckOverlap(workerId, startDate, endDate, excludeId = null) {
    if (!this.client) return false;

    const { data, error } = await this.client.rpc('check_date_overlap', {
      p_worker_id: workerId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_exclude_id: excludeId
    });

    if (error) {
      console.error('[Supabase RPC] Error al validar traslape:', error.message);
      return false;
    }
    return data; // Retorna true si existe conflicto, de lo contrario false
  }
};
