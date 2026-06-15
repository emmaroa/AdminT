/**
 * Core de la Aplicación - Enrutador y Orquestador de Estado (Versión Supabase)
 */
const App = {
  // Estado global en memoria para evitar consultas redundantes a la API
  workers: [],
  requests: [],
  alerts: [],
  currentView: 'dashboard',

  /**
   * Punto de entrada de la aplicación
   */
  async init() {
    console.info('[App] Inicializando sistema...');
    
    // 1. Inicializar persistencia remota o local
    SupabaseClient.init();

    // 2. Verificar estado de autenticación
    if (!Auth.isAuthenticated()) {
      this.forceLogout();
      return;
    }

    // 3. Renderizar elementos fijos de la interfaz de usuario
    this.renderNavigation();
    this.setupGlobalEventListeners();

    // 4. Descargar estado inicial desde el servidor y arrancar
    await this.refreshAppState();
    
    // 5. Cargar la vista por defecto o la guardada en la URL (hash)
    const initialView = window.location.hash.replace('#', '') || 'dashboard';
    this.navigateTo(initialView);
  },

  /**
   * Descarga la información fresca desde Supabase y actualiza los componentes
   */
  async refreshAppState() {
    try {
      this.showLoading(true);
      
      // Consultas asíncronas en paralelo para optimizar tiempos de carga
      const [workersData, requestsData] = await Promise.all([
        SupabaseClient.getWorkers(),
        SupabaseClient.getRequests()
      ]);

      this.workers = workersData;
      this.requests = requestsData;

      // Generar alertas de negocio basadas en los nuevos datos descargados
      this.alerts = Validators.generateAlertsFromData(this.workers, this.requests);

      // Si la vista actual tiene un método de actualización activo, se invoca
      this.refreshCurrentViewComponent();

    } catch (error) {
      console.error('[App] Error al sincronizar el estado con el servidor:', error);
      Utils.showToast('Error de sincronización con el servidor remoto', 'error');
    } finally {
      this.showLoading(false);
    }
  },

  /**
   * Manejador del ruteo interno (Single Page Application)
   * @param {string} viewName - Identificador de la sección
   */
  navigateTo(viewName) {
    // Validar si el usuario tiene permisos explícitos para ver este módulo
    if (!Auth.hasPermission(viewName)) {
      console.warn(`[Router] Acceso denegado a la vista: ${viewName} para el rol: ${Auth.getRole()}`);
      Utils.showToast('No cuenta con permisos para acceder a esta sección', 'error');
      this.navigateTo('dashboard');
      return;
    }

    this.currentView = viewName;
    window.location.hash = viewName;

    // Actualizar estado activo en los menús de navegación laterales/superiores
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === viewName);
    });

    // Ocultar todas las secciones del contenedor HTML y mostrar la activa
    document.querySelectorAll('.app-view').forEach(view => {
      view.style.display = view.id === `${viewName}View` ? 'block' : 'none';
    });

    // Inicializar el render específico del módulo correspondiente
    this.refreshCurrentViewComponent();
  },

  /**
   * Invoca de forma dinámica el método de dibujo del módulo que está en pantalla
   */
  refreshCurrentViewComponent() {
    switch (this.currentView) {
      case 'dashboard':
        if (window.DashboardModule) DashboardModule.render(this.workers, this.requests, this.alerts);
        break;
      case 'workers':
        if (window.WorkersModule) WorkersModule.render(this.workers);
        break;
      case 'requests':
        if (window.RequestsModule) RequestsModule.render(this.requests, this.workers);
        break;
      case 'authorizations':
        if (window.AuthorizationsModule) AuthorizationsModule.render(this.requests);
        break;
      case 'alerts':
        if (window.AlertsModule) AlertsModule.render(this.alerts);
        break;
      default:
        console.warn(`[Router] El módulo visual de la vista "${this.currentView}" no está implementado.`);
    }
  },

  /**
   * Genera el menú dinámico lateral adaptado estrictamente a los permisos del rol logueado
   */
  renderNavigation() {
    const session = Auth.getSession();
    const navContainer = document.getElementById('mainNavigation');
    if (!navContainer || !session) return;

    // Pintar metadatos del perfil de usuario en la barra superior/lateral
    document.getElementById('navUserName').textContent = session.name;
    document.getElementById('navUserRole').textContent = Auth.getRoleLabel();

    let navHTML = '';
    
    // Diccionario de íconos y textos legibles para los links del menú
    const menuMetadata = {
      dashboard: { label: 'Tablero Principal', icon: '📊' },
      workers: { label: 'Plantilla de Personal', icon: '👥' },
      requests: { label: 'Solicitudes e Incidencias', icon: '📋' },
      authorizations: { label: 'Firmas y Autorizaciones', icon: '✍️' },
      alerts: { label: 'Alertas del Sistema', icon: '🔔' }
    };

    // Agregar opciones al menú basándose únicamente en los permisos vigentes del rol de configuración
    const permissions = CONFIG.ROLES[session.role]?.permissions || [];
    permissions.forEach(per => {
      if (menuMetadata[per]) {
        navHTML += `
          <a href="#${per}" class="nav-link" data-view="${per}">
            <span class="nav-icon">${menuMetadata[per].icon}</span>
            <span class="nav-label">${menuMetadata[per].label}</span>
          </a>
        `;
      }
    });

    navContainer.innerHTML = navHTML;

    // Listeners para los clics de la barra de navegación recién inyectada
    navContainer.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateTo(link.dataset.view);
      });
    });
  },

  /**
   * Configura los disparadores de eventos e interceptores globales del sistema
   */
  setupGlobalEventListeners() {
    // Botón general para cierre de sesión
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.forceLogout();
      });
    }

    // Interceptor del botón "Atrás/Adelante" del navegador del cliente
    window.addEventListener('hashchange', () => {
      const targetView = window.location.hash.replace('#', '');
      if (targetView && targetView !== this.currentView) {
        this.navigateTo(targetView);
      }
    });
  },

  /**
   * Control visual del spinner o barra de carga de red
   * @param {boolean} show 
   */
  showLoading(show) {
    const loader = document.getElementById('globalAppLoader');
    if (loader) {
      loader.style.display = show ? 'flex' : 'none';
    }
  },

  /**
   * Limpia las credenciales y redirige de inmediato a la pantalla de Login externo
   */
  forceLogout() {
    Auth.logout();
  }
};

// Arrancar la aplicación una vez que todo el árbol DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
