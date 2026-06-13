/**
 * Módulo de Autenticación y Control de Sesión (Versión Asíncrona para Supabase)
 */
const Auth = {
  SESSION_KEY: 'control_dias_session',

  /**
   * Realiza la verificación de credenciales contra Supabase o LocalStorage
   * @param {string} username 
   * @param {string} password 
   * @returns {Promise<Object>} Resultado de la operación { success: boolean, message: string }
   */
  async login(username, password) {
    try {
      let user = null;

      if (CONFIG.SUPABASE.ENABLED) {
        // Consultar el pool de usuarios desde el cliente de Supabase
        const users = await SupabaseClient.getUsers();
        
        // Buscar coincidencia exacta (fijando minúsculas para el username)
        user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!user) {
          return { success: false, message: 'El usuario ingresado no existe en el sistema.' };
        }

        if (!user.active) {
          return { success: false, message: 'Esta cuenta de usuario se encuentra desactivada.' };
        }

        /**
         * NOTA DE SEGURIDAD: Tu esquema define 'password_hash'. Si usas la función pgcrypto (crypt),
         * la verificación se hace en SQL. Para esta validación en frontend por tabla personalizada,
         * comparamos texto plano o hashes idénticos.
         */
        if (user.password !== password) {
          return { success: false, message: 'Contraseña incorrecta.' };
        }
      } else {
        // Fallback al modo LocalStorage
        const users = Storage.getUsers();
        user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
        
        if (!user) {
          return { success: false, message: 'Usuario o contraseña incorrectos (Modo Local).' };
        }
        
        if (!user.active) {
          return { success: false, message: 'Usuario inactivo.' };
        }
      }

      // Estructurar los datos de la sesión activa
      const sessionData = {
        id: user.id,
        username: user.username,
        name: user.name || user.fullName || user.full_name,
        role: user.role,
        workerId: user.workerId || user.worker_id || null,
        loginAt: new Date().toISOString()
      };

      // Persistir la sesión en el navegador del cliente
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));
      return { success: true, message: 'Acceso autorizado.' };

    } catch (error) {
      console.error('[Auth Error] Error durante el login:', error.message);
      return { success: false, message: 'Error de comunicación con el servidor remoto.' };
    }
  },

  /**
   * Verifica si existe una sesión válida guardada en el navegador
   * @returns {boolean}
   */
  isAuthenticated() {
    const session = this.getSession();
    if (!session) return false;
    
    // Opcional: Validar expiración si es necesario (ej. 8 horas)
    return true;
  },

  /**
   * Recupera el objeto de sesión actual
   * @returns {Object|null}
   */
  getSession() {
    const sessionStr = localStorage.getItem(this.SESSION_KEY);
    if (!sessionStr) return null;
    try {
      return JSON.parse(sessionStr);
    } catch (e) {
      this.logout();
      return null;
    }
  },

  /**
   * Obtiene el rol del usuario logueado
   * @returns {string}
   */
  getRole() {
    const session = this.getSession();
    return session ? session.role : 'consulta';
  },

  /**
   * Obtiene la etiqueta legible del rol actual
   * @returns {string}
   */
  getRoleLabel() {
    const role = this.getRole();
    const roleConfig = CONFIG.ROLES[role];
    return roleConfig ? roleConfig.label : 'Invitado';
  },

  /**
   * Valida si el rol activo cuenta con un permiso específico configurado
   * @param {string} permissionName - Nombre del módulo o acción a validar
   * @returns {boolean}
   */
  hasPermission(permissionName) {
    const role = this.getRole();
    const roleConfig = CONFIG.ROLES[role];
    if (!roleConfig || !Array.isArray(roleConfig.permissions)) return false;
    
    return roleConfig.permissions.includes(permissionName);
  },

  /**
   * Destruye la sesión activa y redirige a la pantalla de login
   */
  logout() {
    localStorage.removeItem(this.SESSION_KEY);
    window.location.href = 'index.html';
  }
};