# Cómo Usar la Interfaz de Usuario

Este documento explica cómo ejecutar y usar la interfaz web del sistema de procesamiento de medidas.

## Requisitos Previos

1. Node.js instalado (v20 o superior)
2. Base de datos configurada (SQLite con Prisma)
3. Variable de entorno GEMINI_API_KEY configurada en `.env`

## Ejecutar el Sistema

### Opción 1: Desarrollo (Recomendado para testing)

Necesitas ejecutar **DOS terminales simultáneamente**:

#### Terminal 1: Backend API (Puerto 3000)
```bash
npm run dev
```

Este comando inicia el servidor Express con la API REST en `http://localhost:3000`

#### Terminal 2: Frontend UI (Puerto 5173)
```bash
npm run dev:ui
```

Este comando inicia el servidor Vite con la interfaz web en `http://localhost:5173`

### Opción 2: Producción

```bash
# 1. Compilar todo
npm run build

# 2. Iniciar servidor backend
npm start

# 3. Servir el frontend
# (El frontend compilado estará en dist-ui/ y puede servirse con cualquier servidor estático)
```

## Acceder a la Aplicación

Una vez que ambos servidores estén corriendo, abre tu navegador en:

```
http://localhost:5173
```

Verás la interfaz principal del sistema.

## Características de la UI

### 1. Subir Archivo Excel

- Haz clic en **"Seleccionar Archivo"**
- Elige un archivo `.xlsx` o `.xls`
- Haz clic en **"Crear Job"**
- El sistema creará un nuevo job y lo mostrará en la lista

### 2. Lista de Jobs

La interfaz muestra todos los jobs con:
- **ID único** del job
- **Estado actual** (created, ingested, completed, error)
- **Fecha de creación**
- **Nombre del archivo**
- **Estado de las 7 stages** (código de colores):
  - Gris: Pendiente
  - Naranja: Procesando
  - Verde: Completado
  - Rojo: Error

### 3. Acciones por Job

Cada job tiene botones de acción:

#### Ver Detalle
- Abre un modal con información completa del job
- Muestra métricas de cada stage
- Muestra errores si los hay

#### Ejecutar Pipeline
- Ejecuta todas las stages del pipeline (1-7)
- Si una stage ya está completada, la salta
- Se puede ejecutar múltiples veces sin problema

#### Exportar CSV / JSON
- Disponible solo cuando el job está **completed**
- Descarga el resultado final en el formato elegido

### 4. Detalle de Job (Modal)

Al hacer clic en "Ver Detalle" verás:
- Estado global del job
- Estado de cada una de las 7 stages
- Métricas específicas por stage:
  - **Stage 1**: Total de filas, columnas detectadas, tamaño de archivo
  - **Stage 2**: Productos estimables y porcentaje
  - **Stage 3**: Filas con medidas completas
  - **Stage 4**: Candidatos procesados por IA, total enriquecido
  - **Stage 5**: Outliers detectados, registros limpiados
  - **Stage 6**: Sets excluidos, porcentaje
  - **Stage 7**: Estadísticas finales, cobertura
- Mensajes de error si alguna stage falló
- Botones para refrescar, ejecutar pipeline, exportar

### 5. Actualización Automática

La lista de jobs se actualiza automáticamente cada 5 segundos, por lo que verás el progreso en tiempo real mientras se ejecuta el pipeline.

## Flujo de Trabajo Típico

1. **Subir archivo Excel**
   - Seleccionar archivo
   - Crear job
   - El job se crea en estado "created"

2. **Ejecutar Pipeline**
   - Hacer clic en "Ejecutar Pipeline"
   - El sistema procesa las 7 stages secuencialmente
   - Observar el progreso en tiempo real (las stages cambian de color)

3. **Ver Resultados**
   - Hacer clic en "Ver Detalle" para ver métricas
   - Revisar estadísticas de cada stage

4. **Exportar Datos**
   - Cuando el job esté en estado "completed"
   - Hacer clic en "Exportar CSV" o "Exportar JSON"
   - El archivo se descarga automáticamente

## Las 7 Etapas del Pipeline

1. **Stage 1: Ingest & Normalize**
   - Lee el archivo Excel
   - Convierte a JSON
   - Extrae columnas y filas

2. **Stage 2: Paquete Estimable**
   - Clasifica productos como estimables o no
   - Basado en palabras clave (sofá, mesa, mueble, etc.)

3. **Stage 3: Normalize Measures**
   - Normaliza medidas a centímetros
   - Calcula volumen del producto (m³)

4. **Stage 4: IA Enrichment**
   - Usa Google Gemini para completar datos faltantes
   - Consulta por EAN
   - Completa medidas de producto y empaque

5. **Stage 5: Outliers Clean**
   - Detecta valores atípicos
   - Limpia medidas inconsistentes
   - Aplica 6 criterios de validación

6. **Stage 6: Filter Sets**
   - Identifica y separa conjuntos/sets
   - Mantiene solo productos individuales

7. **Stage 7: Statistics**
   - Calcula ratio pack vs producto
   - Estadísticas globales y agrupadas
   - Genera dataset final

## Colores de Estado

### Estados de Job
- **Azul**: Created (recién creado)
- **Morado**: Ingested (stage 1 completado)
- **Naranja**: Processing (en proceso)
- **Verde**: Completed (todas las stages exitosas)
- **Rojo**: Error (alguna stage falló)

### Estados de Stage
- **Gris**: Pending (no iniciado)
- **Naranja**: Processing (en ejecución)
- **Verde**: Success (completado exitosamente)
- **Rojo**: Error (falló)

## Solución de Problemas

### El backend no inicia
- Verifica que el puerto 3000 esté disponible
- Revisa que la base de datos esté configurada: `npm run prisma:migrate`
- Verifica que GEMINI_API_KEY esté en `.env`

### El frontend no inicia
- Verifica que el puerto 5173 esté disponible
- Asegúrate de que las dependencias estén instaladas: `npm install`

### No se pueden subir archivos
- Verifica que el backend esté corriendo en puerto 3000
- Revisa la consola del navegador para errores de CORS
- Verifica que el archivo sea .xlsx o .xls

### El pipeline falla
- Haz clic en "Ver Detalle" para ver el error específico
- Revisa que el archivo Excel tenga el formato correcto
- Para Stage 4, verifica que GEMINI_API_KEY sea válida

### Los jobs no se actualizan
- Refresca la página manualmente
- Verifica la conexión con el backend
- Revisa la consola del navegador

## Arquitectura

```
┌─────────────────────────────────────────────┐
│         Frontend (Vite + React)             │
│           http://localhost:5173             │
│                                             │
│  - Subir archivos Excel                    │
│  - Ver lista de jobs                       │
│  - Ejecutar pipeline                       │
│  - Ver detalle y métricas                  │
│  - Exportar resultados                     │
└────────────────┬────────────────────────────┘
                 │
                 │ HTTP/JSON (via proxy)
                 │
┌────────────────▼────────────────────────────┐
│          Backend (Express API)              │
│           http://localhost:3000             │
│                                             │
│  - API REST (11 endpoints)                 │
│  - Pipeline de 7 stages                    │
│  - Integración con Gemini AI               │
│  - Persistencia (SQLite + Files)           │
└─────────────────────────────────────────────┘
```

El frontend se comunica con el backend a través del proxy configurado en Vite, por lo que las llamadas a `/jobs` se redirigen automáticamente a `http://localhost:3000/jobs`.

## Características Avanzadas

### Auto-refresh
Los jobs se recargan automáticamente cada 5 segundos para mostrar el progreso en tiempo real.

### Validaciones
- Solo archivos Excel (.xlsx, .xls)
- Botón de ejecutar pipeline deshabilitado durante ejecución
- Botón de exportar solo visible cuando job está completado

### Feedback Visual
- Mensajes de éxito (verde)
- Mensajes de error (rojo)
- Spinner de carga
- Actualización en tiempo real de estados

## Personalización

Los estilos CSS están en `/client/index.css` y pueden modificarse para cambiar:
- Colores del tema
- Espaciado y tamaños
- Animaciones
- Diseño responsive

El código está modularizado en componentes React separados en `/client/components/`:
- `UploadSection.tsx` - Subida de archivos
- `JobCard.tsx` - Tarjeta de job en lista
- `JobDetail.tsx` - Modal de detalle de job
