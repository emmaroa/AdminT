/**
 * Cliente de Conexión e Interacción con las APIs de Supabase
 */
const SupabaseClient = {
  client: null,

  /**
   * Inicializa la instancia global del cliente utilizando las credenciales de CONFIG
   */
  init() {
    if (!CONFIG.SUPABASE.ENABLED) {
      console.warn("Conexión a Supabase desactivada en la configuración global.");
      return;
    }

    if (typeof supabase === 'undefined') {
      console.error("La librería de Supabase no se encuentra cargada en el DOM (Falta script en app.html).");
      return;
    }

    // Instanciación del cliente de Supabase (inyectado previamente mediante CDN)
    this.client = supabase.createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.ANON_KEY);
  },

  /**
   * Recupera el catálogo completo de usuarios para validación de sesiones
   * @returns {Promise<Array>} Listado de usuarios del sistema
   */
  async getUsers() {
    const { data, error } = await this.client
      .from('users')
      .select('*');

    if (error) {
      console.error("Error al obtener usuarios desde Supabase:", error.message);
      throw error;
    }
    return data || [];
  },

  /**
   * Recupera la plantilla de personal registrada
   * @returns {Promise<Array>} Listado de trabajadores
   */
  async getWorkers() {
    const { data, error } = await this.client
      .from('workers')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) {
      console.error("Error al obtener trabajadores desde Supabase:", error.message);
      throw error;
    }
    return data || [];
  },

  /**
   * Registra una nueva ficha de trabajador en el servidor
   * @param {Object} workerData - Datos normalizados del trabajador
   */
  async insertWorker(workerData) {
    const { data, error } = await this.client
      .from('workers')
      .insert([workerData])
      .select();

    if (error) {
      console.error("Error al registrar trabajador en Supabase:", error.message);
      throw error;
    }
    return data;
  },

  /**
   * Actualiza los datos de un trabajador existente
   * @param {string|number} workerId - Identificador único UUID / ID
   * @param {Object} workerData - Objeto con las propiedades modificadas
   */
  async updateWorker(workerId, workerData) {
    const { data, error } = await this.client
      .from('workers')
      .update(workerData)
      .eq('id', workerId)
      .select();

    if (error) {
      console.error(`Error al actualizar el trabajador ${workerId} en Supabase:`, error.message);
      throw error;
    }
    return data;
  },

  /**
   * Recupera el histórico global de incidencias y solicitudes de permisos
   * @returns {Promise<Array>} Listado de solicitudes
   */
  async getRequests() {
    const { data, error } = await this.client
      .from('requests')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) {
      console.error("Error al obtener solicitudes desde Supabase:", error.message);
      throw error;
    }
    return data || [];
  },

  /**
   * Registra una nueva solicitud de permiso o día económico
   * @param {Object} requestData - Datos estructurados de la solicitud
   */
  async insertRequest(requestData) {
    const { data, error } = await this.client
      .from('requests')
      .insert([requestData])
      .select();

    if (error) {
      console.error("Error al insertar la solicitud en Supabase:", error.message);
      throw error;
    }
    return data;
  },

  /**
   * Actualiza el estado o metadatos de una solicitud (Autorizaciones / Cancelaciones)
   * @param {string|number} requestId 
   * @param {Object} requestData 
   */
  async updateRequest(requestId, requestData) {
    const { data, error } = await this.client
      .from('requests')
      .update(requestData)
      .eq('id', requestId)
      .select();

    if (error) {
      console.error(`Error al modificar la solicitud ${requestId} en Supabase:`, error.message);
      throw error;
    }
    return data;
  }
};
