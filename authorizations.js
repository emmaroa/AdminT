/**
 * Módulo Autorizaciones - Panel para jefes y administradores (Versión Supabase)
 */
const AuthorizationsModule = {
  // Renderizado síncrono del contenedor base para mantener el flujo del orquestador de páginas
  render() {
    if (!Auth.canAuthorize()) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">🔒</div>
          <p>No tiene permisos para autorizar solicitudes</p>
          <p class="text-muted">Este módulo está disponible para Jefes Inmediatos y Administradores</p>
        </div>
      `;
    }

    return `
      <div id="authStatsContainer">
        <div class="dashboard-stats mb-3">
          <div class="stat-card">
            <div class="stat-icon orange">📋</div>
            <div class="stat-content">
              <h4>Pendientes de Autorización</h4>
              <div class="stat-value">...</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>✅ Solicitudes Pendientes de Autorización</h3></div>
        <div class="card-body" id="authList">
          <div class="text-center p-3">⏳ Cargando solicitudes pendientes...</div>
        </div>
      </div>
    `;
  },

  // Inicialización asíncrona para obtener y filtrar datos desde Supabase
  async init() {
    if (!Auth.canAuthorize()) return;

    const authListContainer = document.getElementById('authList');
    const authStatsContainer = document.getElementById('authStatsContainer');

    try {
      const session = Auth.getSession();
      
      // Consultar todas las solicitudes registradas en la base de datos
      const rawRequests = await SupabaseClient.getRequests();

      // Normalizar estructura del modelo de datos y filtrar por estatus "pendiente"
      let pending = rawRequests
        .map(r => ({
          id: r.id,
          workerId: r.worker_id || r.workerId,
          workerName: r.worker_name || r.workerName || 'Trabajador',
          employeeNumber: r.employee_number || r.employeeNumber || '',
          area: r.area || '',
          type: r.type,
          status: r.status,
          startDate: r.start_date || r.startDate,
          endDate: r.end_date || r.endDate,
          days: parseInt(r.days) || 0,
          reason: r.reason || '',
          observations: r.observations || '',
          workedDate: r.worked_date || r.workedDate || null,
          swapDate: r.swap_date || r.swapDate || null,
          capturedBy: r.captured_by || r.capturedBy || '',
          captureDate: r.capture_date || r.captureDate || r.created_at
        }))
        .filter(r => r.status === 'pendiente');

      // Restricción de visibilidad si la sesión pertenece a un Rol de Jefe Inmediato
      if (session.role === 'jefe' && (session.workerId || session.worker_id)) {
        const targetBossId = session.workerId || session.worker_id;
        
        // Obtener la colección completa de trabajadores para filtrar por jerarquía de área
        const workers = await SupabaseClient.getWorkers();
        const bossProfile = workers.find(w => w.id === targetBossId);
        
        if (bossProfile && bossProfile.area) {
          pending = pending.filter(r => r.area === bossProfile.area);
        } else {
          // Fallback de seguridad en caso de inconsistencia en el registro del jefe
          pending = pending.filter(r => r.workerId === targetBossId);
        }
      }

      // Actualizar tarjeta métrica dinámica
      if (authStatsContainer) {
        authStatsContainer.innerHTML = `
          <div class="dashboard-stats mb-3">
            <div class="stat-card">
              <div class="stat-icon orange">📋</div>
              <div class="stat-content">
                <h4>Pendientes de Autorización</h4>
                <div class="stat-value">${pending.length}</div>
              </div>
            </div>
          </div>
        `;
      }

      // Inyectar el listado de tarjetas pendientes procesadas
      if (authListContainer) {
        if (pending.length === 0) {
          authListContainer.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>No hay solicitudes pendientes</p></div>';
        } else {
          authListContainer.innerHTML = pending.map(r => this.renderAuthCard(r)).join('');
        }
      }

    } catch (err) {
      console.error("Error al cargar el panel de autorizaciones:", err);
      if (authListContainer) {
        authListContainer.innerHTML = '<div class="text-error">Error al conectar con Supabase al traer el listado de aprobación</div>';
      }
    }
  },

  // Genera el bloque HTML correspondiente a cada solicitud pendiente
  renderAuthCard(r) {
    return `
      <div class="auth-card" id="auth-${r.id}">
        <div class="auth-card-header">
          <div>
            <strong>${Utils.escapeHtml(r.workerName)}</strong> (${r.employeeNumber})<br>
            <small class="text-muted">${Utils.escapeHtml(r.area)}</small>
          </div>
          <div>${Utils.getTypeBadge(r.type)} ${Utils.getStatusBadge(r.status)}</div>
        </div>
        <div class="form-row">
          <div><strong>Periodo:</strong> ${Utils.formatDate(r.startDate)} - ${Utils.formatDate(r.endDate)} (${r.days} días)</div>
        </div>
        <p><strong>Motivo:</strong> ${Utils.escapeHtml(r.reason)}</p>
        ${r.observations ? `<p><strong>Observaciones:</strong> ${Utils.escapeHtml(r.observations)}</p>` : ''}
        ${r.type === 'cambio_dia' ? `<p><strong>Fecha trabajada:</strong> ${Utils.formatDate(r.workedDate)} → <strong>Cambio:</strong> ${Utils.formatDate(r.swapDate)}</p>` : ''}
        <p class="text-muted" style="font-size:0.8rem;">Capturó: ${Utils.escapeHtml(r.capturedBy)} - ${Utils.formatDateTime(r.captureDate)}</p>

        <div class="form-group mt-2">
          <label>Comentario de autorización</label>
          <input type="text" class="form-control" id="comment-${r.id}" placeholder="Comentario opcional...">
        </div>

        <div class="auth-card-actions">
          <button class="btn btn-success btn-sm" onclick="AuthorizationsModule.authorize('${r.id}', 'autorizado')">✅ Autorizar</button>
          <button class="btn btn-danger btn-sm" onclick="AuthorizationsModule.authorize('${r.id}', 'rechazado')">❌ Rechazar</button>
          <button class="btn btn-outline btn-sm" onclick="RequestsModule.viewDetail('${r.id}')">👁️ Ver Detalle</button>
        </div>
      </div>
    `;
  },

  // Resuelve la mutación del estado normativo y actualiza la fila correspondiente en Supabase
  async authorize(requestId, status) {
    const session = Auth.getSession();
    const comment = document.getElementById(`comment-${requestId}`)?.value || '';

    try {
      // Validar topes legales y colisiones operativas en memoria antes de confirmar la transacción
      if (status === 'autorizado') {
        const rawRequests = await SupabaseClient.getRequests();
        const rawRequest = rawRequests.find(r => r.id === requestId);
        
        if (!rawRequest) {
          Utils.showToast("No se pudo localizar el objeto de la solicitud", "error");
          return;
        }

        const normalizedRequest = {
          id: rawRequest.id,
          workerId: rawRequest.worker_id || rawRequest.workerId,
          workerName: rawRequest.worker_name || rawRequest.workerName,
          type: rawRequest.type,
          status: rawRequest.status,
          startDate: rawRequest.start_date || rawRequest.startDate,
          endDate: rawRequest.end_date || rawRequest.endDate,
          days: parseInt(rawRequest.days) || 0
        };

        // Fallback dinámico sobre Validators para evitar excepciones críticas
        if (window.Validators && typeof window.Validators.validateRequest === 'function') {
          const validation = window.Validators.validateRequest(normalizedRequest, requestId);
          if (!validation.valid) {
            Utils.showToast(validation.errors[0], 'error');
            return;
          }
        }
      }

      // Estructurar el objeto adaptado a la nomenclatura de base de datos relacional de Supabase
      const updateData = {
        status: status,
        authorized_by: session.name || session.username,
        authorized_by_id: session.userId || session.id || null,
        authorization_date: new Date().toISOString(),
        authorization_comment: comment
      };

      // Ejecutar persistencia persistente sobre la API remota
      await SupabaseClient.updateRequest(requestId, updateData);

      Utils.showToast(`Solicitud ${status === 'autorizado' ? 'autorizada' : 'rechazada'} con éxito`);
      
      // Recargar página actual y reevaluar contadores de notificaciones globales
      if (window.App && typeof window.App.loadPage === 'function') {
        window.App.loadPage('authorizations');
      }
      if (window.App && typeof window.App.updateAlertBadge === 'function') {
        window.App.updateAlertBadge();
      }

    } catch (err) {
      console.error("Error al procesar la actualización del estatus:", err);
      Utils.showToast("Error crítico del servidor al intentar cambiar el estado de la solicitud", "error");
    }
  }
};