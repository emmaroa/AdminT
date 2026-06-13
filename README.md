# Sistema de Control de Días

Plataforma web administrativa para registrar, consultar, controlar y visualizar los días solicitados por trabajadores (días económicos, vacaciones, incapacidades y cambios por operatividad).

## Características

- **Login con roles**: Administrador, Capturista, Jefe Inmediato, Consulta
- **Dashboard** con tarjetas estadísticas y gráficas interactivas
- **Catálogo de trabajadores** con CRUD completo
- **Registro de solicitudes** con validaciones automáticas
- **Calendario visual** con filtros por mes, trabajador, tipo y estatus
- **Reportes** por periodo de fechas con exportación Excel/PDF e impresión
- **Panel de autorizaciones** para jefes y administradores
- **Alertas** de límites, traslapes y solicitudes pendientes
- **Historial completo** por trabajador
- **Diseño institucional** responsivo con paleta de colores corporativa

## Paleta de Colores


| Color              | Hex       |
| ------------------ | --------- |
| Naranja principal  | `#FC712B` |
| Naranja secundario | `#FD9319` |
| Amarillo           | `#FECD5A` |
| Azul turquesa      | `#07B1BC` |
| Verde petróleo     | `#2B8180` |


## Estructura del Proyecto

```
control-dias-trabajadores/
├── index.html              # Página de login
├── app.html                # Aplicación principal (SPA)
├── css/
│   ├── variables.css       # Variables CSS institucionales
│   ├── base.css            # Reset y estilos base
│   ├── components.css      # Botones, tarjetas, tablas, modales
│   ├── layout.css          # Sidebar, header, login
│   └── pages.css           # Estilos por módulo
├── js/
│   ├── config.js           # Configuración global y permisos
│   
│   ├── auth.js             # Autenticación y sesión
│   ├── utils.js            # Utilidades y exportación
│   ├── validators.js       # Validaciones de negocio
│   ├── supabase-client.js  # Cliente Supabase (opcional)
│   ├── app.js              # Router principal
│   └── modules/
│       ├── dashboard.js
│       ├── workers.js
│       ├── requests.js
│       ├── calendar.js
│       ├── reports.js
│       ├── alerts.js
│       ├── history.js
│       └── authorizations.js
├── supabase/
│   └── schema.sql          # Esquema de base de datos
└── README.md
```

## Instalación y Ejecución

### Opción 1: Servidor local simple (recomendado)

```powershell
# Navegar al proyecto
cd C:\Users\vzarate\control-dias-trabajadores

# Con Python (si está instalado)
python -m http.server 8080

# O con Node.js
npx serve -p 8080
```

Abrir en el navegador: **[http://localhost:8080](http://localhost:8080)**

### Opción 2: Abrir directamente

Abrir `index.html` en el navegador. Algunas funciones CDN requieren conexión a internet.

### Usuarios de Demostración


| Usuario    | Contraseña | Rol            |
| ---------- | ---------- | -------------- |
| admin      | admin123   | Administrador  |
| capturista | capt123    | Capturista     |
| jefe       | jefe123    | Jefe Inmediato |
| consulta   | cons123    | Consulta       |


## Configuración con Supabase (Producción)

1. Crear proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor** y ejecutar el contenido de `supabase/schema.sql`
3. Obtener **URL** y **anon key** en Settings → API
4. Editar `js/config.js`:

```javascript
SUPABASE: {
  URL: 'https://tu-proyecto.supabase.co',
  ANON_KEY: 'tu-anon-key-aqui',
  ENABLED: true
}
```

1. Agregar en `app.html` antes de los scripts:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/supabase-client.js"></script>
```

1. Adaptar `storage.js` para usar `SupabaseClient` cuando `ENABLED` sea `true`

## Permisos por Rol


| Módulo         | Admin | Capturista | Jefe | Consulta |
| -------------- | ----- | ---------- | ---- | -------- |
| Dashboard      | ✅     | ✅          | ✅    | ✅        |
| Trabajadores   | ✅     | ✅          | ❌    | ❌        |
| Solicitudes    | ✅     | ✅          | ✅    | ❌        |
| Calendario     | ✅     | ✅          | ✅    | ✅        |
| Autorizaciones | ✅     | ❌          | ✅    | ❌        |
| Historial      | ✅     | ✅          | ✅    | ✅        |
| Reportes       | ✅     | ✅          | ✅    | ✅        |
| Alertas        | ✅     | ✅          | ✅    | ✅        |


## Cómo Modificar el Sistema

### Agregar o editar trabajadores

1. Iniciar sesión como **admin** o **capturista**
2. Ir a **Trabajadores** → **+ Nuevo Trabajador**
3. Completar: nombre, número de empleado, área, puesto, jefe inmediato
4. Asignar **días de vacaciones** (variable por trabajador)
5. Los días económicos tienen límite fijo de **9 por año**

### Modificar días disponibles

- **Vacaciones**: Editar trabajador → campo "Días de Vacaciones Asignados"
- **Económicos**: Límite en `js/config.js` → `MAX_DIAS_ECONOMICOS: 9`

### Modificar permisos de roles

Editar `js/config.js`, sección `ROLES`:

```javascript
capturista: {
  label: 'Capturista',
  permissions: ['dashboard', 'workers', 'requests', ...]
}
```

Agregar o quitar módulos del array `permissions`.

### Agregar un nuevo módulo

1. Crear `js/modules/nuevo-modulo.js` con objeto `{ render(), init() }`
2. Agregar script en `app.html`
3. Agregar entrada en sidebar de `app.html`
4. Registrar en `app.js` → objeto `modules`
5. Agregar permiso en `config.js` → `ROLES`

## Validaciones Implementadas

- No duplicar fechas para el mismo trabajador
- No exceder 9 días económicos anuales
- No exceder vacaciones asignadas
- Fecha final ≥ fecha inicial
- Cambio de día requiere jefe inmediato y fechas específicas
- Número de empleado único
- Trabajador activo para nuevas solicitudes

## Reportes Disponibles

### Por periodo de fechas

- Filtros: fechas, trabajador, tipo, estatus, área, jefe
- Acciones: Generar, Imprimir, Excel, PDF

### Predefinidos

- Por trabajador, por tipo, anual, mensual
- Días económicos disponibles, vacaciones pendientes
- Incapacidades, cambios por operatividad

## Resetear Datos de Demostración

En la consola del navegador (F12):

```javascript
localStorage.removeItem('cdt_initialized');
localStorage.clear();
location.reload();
```

## Tecnologías

- HTML5, CSS3, JavaScript (Vanilla ES6+)
- Chart.js (gráficas)
- SheetJS/xlsx (exportación Excel)
- jsPDF + autotable (exportación PDF)
- Supabase (base de datos opcional)
- localStorage (almacenamiento local por defecto)

## Licencia

Uso interno institucional.