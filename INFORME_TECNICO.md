# INFORME TÉCNICO COMPLETO
# Microservicio de Procesamiento de Medidas de Productos

**Fecha:** 4 de Diciembre de 2025
**Versión:** 1.0.0
**Stack Tecnológico:** Node.js + TypeScript + Express + Prisma + SQLite

---

## ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Modelo de Datos](#3-modelo-de-datos)
4. [Pipeline de Procesamiento](#4-pipeline-de-procesamiento)
5. [API REST - Endpoints](#5-api-rest-endpoints)
6. [Flujo de Datos](#6-flujo-de-datos)
7. [Manejo de Errores y Recuperación](#7-manejo-de-errores-y-recuperación)
8. [Seguridad y Validaciones](#8-seguridad-y-validaciones)
9. [Estructura del Proyecto](#9-estructura-del-proyecto)
10. [Dependencias y Tecnologías](#10-dependencias-y-tecnologías)
11. [Operaciones y Deployment](#11-operaciones-y-deployment)
12. [Métricas y Observabilidad](#12-métricas-y-observabilidad)

---

## 1. RESUMEN EJECUTIVO

### 1.1 Propósito del Sistema

Este microservicio backend está diseñado para procesar información de medidas de productos contenida en archivos Excel, aplicando un pipeline de transformación de datos en 7 etapas secuenciales. El sistema normaliza, enriquece, limpia y calcula estadísticas sobre dimensiones de productos y sus empaques.

### 1.2 Capacidades Principales

- **Ingesta de archivos Excel** (.xlsx, .xls) con validación y almacenamiento
- **Pipeline de procesamiento en 7 etapas** independientes y orquestables
- **Enriquecimiento con IA** utilizando Google Gemini para completar datos faltantes
- **Detección y limpieza de outliers** basada en reglas de negocio
- **Cálculo de estadísticas** globales y agrupadas por categorías
- **Exportación de resultados** en formatos CSV y JSON
- **Ejecución flexible** por etapas individuales o pipeline completo
- **Seguimiento completo** del estado de procesamiento de cada job

### 1.3 Indicadores Clave

| Métrica | Valor |
|---------|-------|
| Endpoints HTTP | 11 rutas RESTful |
| Etapas de procesamiento | 7 stages secuenciales |
| Formatos de entrada | Excel (.xlsx, .xls) |
| Formatos de salida | JSON, CSV |
| Base de datos | SQLite con Prisma ORM |
| Enriquecimiento IA | Google Gemini API |
| Validaciones de negocio | 50+ reglas |

---

## 2. ARQUITECTURA DEL SISTEMA

### 2.1 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  (HTTP Clients, Frontend Apps, API Consumers)               │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ HTTP/JSON
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     EXPRESS SERVER                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Routes Layer (/jobs)                                  │ │
│  │  - POST   /jobs                     (Create Job)       │ │
│  │  - POST   /jobs/:jobId/stage1..7    (Run Stages)      │ │
│  │  - POST   /jobs/:jobId/run          (Run Pipeline)    │ │
│  │  - GET    /jobs                     (List Jobs)        │ │
│  │  - GET    /jobs/:jobId              (Get Job Detail)  │ │
│  │  - GET    /jobs/:jobId/export       (Export Results)  │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│                            ▼                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Services Layer                                        │ │
│  │  - stage1.ts  (Ingestion)                             │ │
│  │  - stage2.ts  (Classification)                        │ │
│  │  - stage3.ts  (Normalization)                         │ │
│  │  - stage4.ts  (AI Enrichment)                         │ │
│  │  - stage5.ts  (Outlier Detection)                     │ │
│  │  - stage6.ts  (Filtering)                             │ │
│  │  - stage7.ts  (Statistics)                            │ │
│  │  - gemini.ts  (AI Integration)                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│                            ▼                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Data Layer (Prisma ORM)                              │ │
│  │  - Job CRUD operations                                │ │
│  │  - Stage status management                            │ │
│  │  - Transaction handling                               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   PERSISTENCE LAYER                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   SQLite     │  │ File System  │  │  Google Gemini   │  │
│  │   Database   │  │  (uploads/   │  │   AI Service     │  │
│  │   (jobs)     │  │   data/)     │  │  (API externa)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Capas del Sistema

#### 2.2.1 Capa de Presentación (HTTP)
- **Framework:** Express.js
- **Middleware:** JSON parser, URL encoded, Multer (file uploads)
- **Formato:** REST API con respuestas JSON
- **Puerto:** 3000 (configurable via PORT env)

#### 2.2.2 Capa de Rutas
- **Archivo:** `src/routes/jobs.ts`
- **Responsabilidad:** Enrutamiento, validación de entrada, gestión de respuestas HTTP
- **Validaciones:** jobId, file uploads, stage ranges, query parameters

#### 2.2.3 Capa de Servicios
- **Ubicación:** `src/services/`
- **Patrón:** Un servicio por stage + servicio de IA compartido
- **Responsabilidad:** Lógica de negocio, transformación de datos, orquestación

#### 2.2.4 Capa de Datos
- **ORM:** Prisma Client
- **Base de datos:** SQLite (archivo local)
- **Almacenamiento:** File system para archivos y resultados intermedios

### 2.3 Patrones de Diseño Implementados

1. **Service Layer Pattern:** Separación entre controladores y lógica de negocio
2. **Repository Pattern:** Abstracción de acceso a datos mediante Prisma
3. **Pipeline Pattern:** Procesamiento secuencial por etapas
4. **Error Handling Pattern:** Manejo consistente de errores en todos los layers
5. **Status Pattern:** Seguimiento de estado para cada stage del pipeline

---

## 3. MODELO DE DATOS

### 3.1 Esquema de Base de Datos

#### Tabla: Job

```sql
CREATE TABLE Job (
  id            TEXT PRIMARY KEY,      -- CUID generado automáticamente
  createdAt     DATETIME DEFAULT NOW,  -- Timestamp de creación
  status        TEXT NOT NULL,         -- Estado global del job
  inputFilePath TEXT NOT NULL,         -- Ruta al archivo Excel original
  stages        TEXT NOT NULL,         -- JSON con estado de cada stage
  summary       TEXT                   -- JSON con métricas finales (opcional)
);
```

**Índices:**
- PRIMARY KEY en `id`
- Sin índices secundarios (volumen bajo esperado)

### 3.2 Estados del Job (status)

| Estado | Descripción | Transiciones Posibles |
|--------|-------------|-----------------------|
| `created` | Job creado, archivo subido | → `ingested`, `error` |
| `ingested` | Stage 1 completado | → `stage2_done`, `error` |
| `stage2_done` | Stage 2 completado | → `stage3_done`, `error` |
| `stage3_done` | Stage 3 completado | → `stage4_done`, `error` |
| `stage4_done` | Stage 4 completado | → `stage5_done`, `error` |
| `stage5_done` | Stage 5 completado | → `stage6_done`, `error` |
| `stage6_done` | Stage 6 completado | → `completed`, `error` |
| `completed` | Todas las stages exitosas | → (terminal) |
| `error` | Fallo en alguna stage | → (recuperable) |

### 3.3 Estructura del Campo `stages` (JSON)

El campo `stages` almacena un objeto JSON con la siguiente estructura:

```typescript
interface JobStages {
  stage1_ingest_normalize: StageStatus;
  stage2_paquete_estimable: StageStatus;
  stage3_normalize_measures: StageStatus;
  stage4_ia_enrichment: StageStatus;
  stage5_outliers_clean: StageStatus;
  stage6_filter_sets: StageStatus;
  stage7_stats: StageStatus;
}

interface StageStatus {
  status: 'pending' | 'processing' | 'success' | 'error';
  message?: string;
  startedAt?: string;
  completedAt?: string;
  metrics?: any;
  errorMessage?: string;
}
```

**Ejemplo de stages JSON:**

```json
{
  "stage1_ingest_normalize": {
    "status": "success",
    "metrics": {
      "totalRows": 1500,
      "columns": ["EAN", "Descripcion", "Ancho", "Alto", "Fondo"],
      "fileSizeBytes": 245678,
      "outputPath": "data/clx123/stage1_base.json"
    }
  },
  "stage2_paquete_estimable": {
    "status": "success",
    "metrics": {
      "totalRows": 1500,
      "estimables": 1200,
      "pctEstimables": 80.0,
      "outputPath": "data/clx123/stage2_paquete_estimable.json"
    }
  },
  "stage3_normalize_measures": {
    "status": "processing"
  },
  "stage4_ia_enrichment": {
    "status": "pending"
  }
}
```

### 3.4 Sistema de Archivos

```
project/
├── uploads/
│   └── <jobId>/
│       └── input.xlsx              # Archivo Excel original
│
└── data/
    └── <jobId>/
        ├── stage1_base.json        # Datos base extraídos
        ├── stage2_paquete_estimable.json
        ├── stage3_medidas_normalizadas.json
        ├── stage4_enriched.json
        ├── stage5_outliers.json    # Registros con problemas
        ├── stage5_clean.json       # Registros limpios
        ├── stage6_main_clean.json  # Dataset principal
        ├── stage6_excluded_sets.json
        ├── stage7_final.json       # Resultado final
        ├── stage7_stats_global.json
        ├── stage7_stats_by_linea.json
        └── stage7_stats_by_familia.json
```

---

## 4. PIPELINE DE PROCESAMIENTO

### 4.1 Visión General del Pipeline

El sistema implementa un pipeline de 7 etapas secuenciales. Cada etapa:

1. Lee el output de la etapa anterior
2. Aplica transformaciones específicas
3. Guarda el resultado en un nuevo archivo JSON
4. Actualiza las métricas en la base de datos
5. Transiciona el estado del job

```
Excel → Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 6 → Stage 7 → Export
        Ingest    Classify  Normalize  Enrich    Clean     Filter    Stats
```

### 4.2 Stage 1: Ingest & Normalize

**Servicio:** `src/services/stage1.ts`
**Función:** `processStage1(jobId: string)`

#### Propósito
Extrae datos del archivo Excel y los convierte a formato JSON estructurado.

#### Proceso Detallado

1. **Validación de entrada:**
   - Verifica que el job existe en BD
   - Verifica que inputFilePath no está vacío
   - Verifica que el archivo existe en el filesystem

2. **Lectura del Excel:**
   ```typescript
   const workbook = XLSX.readFile(inputPath);
   const firstSheetName = workbook.SheetNames[0];
   const worksheet = workbook.Sheets[firstSheetName];
   const rows = XLSX.utils.sheet_to_json(worksheet);
   ```

3. **Extracción de columnas:**
   - Itera sobre todas las filas
   - Recolecta todas las claves únicas encontradas
   - Genera un array de nombres de columnas

4. **Persistencia:**
   - Guarda el array de objetos en `data/<jobId>/stage1_base.json`
   - Formato: JSON pretty-printed (indent 2)

5. **Métricas calculadas:**
   ```typescript
   {
     totalRows: number,        // Cantidad de filas procesadas
     columns: string[],        // Nombres de columnas detectadas
     inputFilePath: string,    // Ruta del archivo original
     outputPath: string,       // Ruta del JSON generado
     fileSizeBytes: number     // Tamaño del archivo Excel
   }
   ```

6. **Actualización del job:**
   - Estado global: `"ingested"`
   - Stage status: `"success"`

#### Manejo de Errores
- Si falla: actualiza stage status a `"error"` con el mensaje de error
- Estado global del job: `"error"`

---

### 4.3 Stage 2: Paquete Estimable

**Servicio:** `src/services/stage2.ts`
**Función:** `processStage2(jobId: string)`

#### Propósito
Clasifica cada producto para determinar si es candidato para estimación de medidas de empaque.

#### Lógica de Clasificación

**Criterios de inclusión (palabras clave en Linea/Familia/Descripción):**
```
sofa, sofá, sillon, sillón, butaca, mesa, armario, cabecero,
colchon, colchón, canape, cómoda, comoda, aparador, mueble,
frigorifico, frigorífico, lavadora, campana, horno
```

**Criterios de exclusión (palabras clave):**
```
funda, textil, almohada, sábana, sabana, cojin, cojín, vajilla,
cuberteria, cubertería, menaje, toalla, plato, vaso, taza
```

**Algoritmo:**
```
1. Concatenar campos: Linea + Familia + Descripcion (lowercase)
2. Si contiene alguna palabra de exclusión → paquete_estimable = false
3. Si contiene alguna palabra de inclusión → paquete_estimable = true
4. Si no coincide con ninguna → paquete_estimable = false
```

#### Proceso

1. **Dependencia:** Requiere stage 1 en status `"success"`
2. **Entrada:** Lee `stage1_base.json`
3. **Transformación:** Añade campo `paquete_estimable: boolean` a cada fila
4. **Salida:** Guarda en `stage2_paquete_estimable.json`
5. **Métricas:**
   ```typescript
   {
     totalRows: number,
     estimables: number,
     pctEstimables: number,  // Porcentaje de productos estimables
     outputPath: string
   }
   ```

---

### 4.4 Stage 3: Normalize Measures

**Servicio:** `src/services/stage3.ts`
**Función:** `processStage3(jobId: string)`

#### Propósito
Normaliza las medidas de productos (ancho, fondo, alto) a formato numérico en centímetros y calcula el volumen en m³.

#### Algoritmo de Normalización

**Función:** `toNumberCm(value: any) → number | null`

```typescript
// Procesa diferentes formatos:
// - Números: 120
// - Strings: "120", "120cm", "120 cm", "1,2m"
// - Con símbolos: "120 cm.", "120cm"

1. Si es null/undefined → null
2. Si es number → retornar directamente
3. Si es string:
   a. Convertir a lowercase
   b. Reemplazar comas por puntos
   c. Eliminar todo excepto números y puntos
   d. Parsear a float
   e. Si NaN → null, sino → número
```

**Búsqueda de campos en el Excel:**

La función `findValueByKeyContains(row, substring)` busca columnas de forma flexible:

- Busca "ancho" → puede encontrar "Ancho_cm", "ANCHO", "ancho_producto", etc.
- Busca "fondo" o "largo" → acepta cualquiera
- Busca "alto" → puede encontrar "Alto_cm", "ALTO", etc.

#### Transformaciones Aplicadas

Para cada fila:

```typescript
1. Si no tiene ancho_cm → buscar columna con "ancho" y normalizar
2. Si no tiene fondo_cm → buscar "fondo" o "largo" y normalizar
3. Si no tiene alto_cm → buscar "alto" y normalizar
4. Si tiene las 3 medidas → calcular producto_m3:
   producto_m3 = (ancho_cm / 100) * (fondo_cm / 100) * (alto_cm / 100)
```

#### Métricas

```typescript
{
  totalRows: number,
  conMedidasCompletas: number,  // Filas con ancho, fondo y alto
  conProductoM3: number,         // Filas con volumen calculado
  outputPath: string
}
```

---

### 4.5 Stage 4: IA Enrichment (Google Gemini)

**Servicio:** `src/services/stage4.ts`
**Función:** `processStage4(jobId: string, limit: number = 20)`

#### Propósito
Utiliza Google Gemini AI para completar medidas faltantes de productos y empaques consultando por EAN.

#### Configuración de Gemini

**Archivo:** `src/services/gemini.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
```

#### Criterios de Candidatos para Enriquecimiento

Un producto es candidato si:
1. `paquete_estimable === true`
2. Tiene un valor en el campo EAN
3. NO ha sido enriquecido previamente (`gemini_enriched !== true`)
4. Le falta alguna de estas medidas:
   - ancho_cm, fondo_cm, alto_cm (producto)
   - pack_ancho_cm, pack_fondo_cm, pack_alto_cm, pack_m3 (empaque)

#### Prompt para Gemini

```typescript
function buildMeasuresPrompt(ean: string, description: string): string {
  return `
Eres un experto en productos de retail. Dado el siguiente EAN y descripción,
proporciona las medidas del producto y su empaque.

EAN: ${ean}
Descripción: ${description}

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "ancho_cm": <número o null>,
  "fondo_cm": <número o null>,
  "alto_cm": <número o null>,
  "pack_ancho_cm": <número o null>,
  "pack_fondo_cm": <número o null>,
  "pack_alto_cm": <número o null>,
  "pack_m3": <número o null>
}

IMPORTANTE:
- Si no conoces una medida, usa null
- Todas las medidas lineales en centímetros
- pack_m3 en metros cúbicos
- Solo números y null, sin texto adicional
- Responde solo con el JSON, sin explicaciones
`;
}
```

#### Proceso de Enriquecimiento

```typescript
Para cada candidato (hasta 'limit' por llamada):
  1. Construir prompt con EAN y descripción
  2. Llamar a Gemini API
  3. Parsear respuesta JSON
  4. Para cada campo (ancho_cm, fondo_cm, etc.):
     - Si el producto no tiene valor Y Gemini devuelve valor válido
     - Actualizar el campo con el valor de Gemini
  5. Marcar gemini_enriched = true
  6. Si hay error → marcar gemini_error = true y continuar
```

#### Estados de la Stage

- **`processing`:** Aún quedan candidatos por procesar
- **`success`:** Todos los candidatos fueron procesados

#### Métricas

```typescript
{
  totalRows: number,
  totalCandidates: number,      // Total de filas que necesitan enriquecimiento
  processedThisCall: number,    // Filas procesadas en esta llamada
  totalEnriched: number,        // Total de filas enriquecidas hasta ahora
  outputPath: string
}
```

#### Límite de Procesamiento

Por defecto procesa 20 registros por llamada para:
- Controlar costos de API
- Evitar timeouts largos
- Permitir procesamiento incremental

Se puede llamar múltiples veces hasta que `status === "success"`

---

### 4.6 Stage 5: Outliers Clean

**Servicio:** `src/services/stage5.ts`
**Función:** `processStage5(jobId: string)`

#### Propósito
Detecta y limpia valores atípicos en las medidas de productos y empaques que no son razonables.

#### Umbrales Configurados

```typescript
const UMBRAL_PACK_M3_GROTESCO = 30;       // m³ máximo para un paquete
const UMBRAL_DIM_CM_MAX = 400;            // cm máximo para una dimensión
const UMBRAL_RATIO_ALTO = 8;              // ratio pack/producto máximo
const UMBRAL_RATIO_BAJO = 0.7;            // ratio pack/producto mínimo
```

#### Motivos de Outlier

Cada registro se evalúa por los siguientes motivos:

| Motivo | Condición | Descripción |
|--------|-----------|-------------|
| `motivo_pack_m3_grotesco` | pack_m3 > 30 | Volumen de empaque irrealmente grande |
| `motivo_dim_producto_grande` | ancho/fondo/alto > 400 cm | Dimensión de producto excesiva |
| `motivo_dim_paquete_grande` | pack_ancho/fondo/alto > 400 cm | Dimensión de empaque excesiva |
| `motivo_ratio_alto` | pack_m3/producto_m3 > 8 | Empaque desproporcionadamente grande |
| `motivo_ratio_bajo` | pack_m3/producto_m3 < 0.7 | Empaque más pequeño que el producto |
| `motivo_pack_mas_peq_que_producto` | pack_ancho < ancho - 1 (similar para otras dims) | Empaque más pequeño que producto |

#### Acción de Limpieza

Para cada outlier detectado:

**Siempre:**
- Limpiar medidas del paquete:
  - pack_ancho_cm = null
  - pack_fondo_cm = null
  - pack_alto_cm = null
  - pack_m3 = null

**Si motivo_dim_producto_grande:**
- Limpiar también medidas del producto:
  - ancho_cm = null
  - fondo_cm = null
  - alto_cm = null
  - producto_m3 = null

#### Salidas Generadas

1. **stage5_outliers.json:** Registros con problemas detectados (incluye todos los motivos)
2. **stage5_clean.json:** Dataset completo con outliers limpiados

#### Métricas

```typescript
{
  totalRows: number,
  numOutliers: number,           // Cantidad de registros con problemas
  numClean: number,              // Total de registros (siempre == totalRows)
  numPackLimpiados: number,      // Cantidad de empaques limpiados
  numProductoLimpiado: number,   // Cantidad de productos limpiados
  outliersPath: string,
  cleanPath: string
}
```

---

### 4.7 Stage 6: Filter Sets

**Servicio:** `src/services/stage6.ts`
**Función:** `processStage6(jobId: string)`

#### Propósito
Excluye del dataset principal los productos que son conjuntos o sets (múltiples ítems), ya que sus medidas no representan un único producto.

#### Patrones de Detección

```typescript
const PATTERNS_CONJUNTOS = [
  "conjunto",
  " set ",
  "set de",
  "composición",
  "composicion",
  "juego de",
  " pack ",
  "pack de"
];
```

#### Algoritmo

```typescript
Para cada fila:
  1. Buscar campos: Descripcion, Linea, Familia
  2. Concatenar valores (lowercase)
  3. Si contiene algún patrón → es_conjunto = true
  4. Sino → es_conjunto = false
```

#### Separación de Datasets

- **Conjunto detectado:** Mover a `stage6_excluded_sets.json`
- **Producto individual:** Mantener en `stage6_main_clean.json`

#### Métricas

```typescript
{
  totalRows: number,
  numExcluded: number,      // Cantidad de sets excluidos
  numMain: number,          // Cantidad en dataset principal
  pctExcluded: number,      // Porcentaje de exclusión
  mainPath: string,
  excludedPath: string
}
```

---

### 4.8 Stage 7: Stats

**Servicio:** `src/services/stage7.ts`
**Función:** `processStage7(jobId: string)`

#### Propósito
Calcula estadísticas descriptivas globales y agrupadas sobre el dataset final limpio.

#### Cálculos Realizados

##### 1. Ratio Pack vs Producto

Para cada registro con `producto_m3 > 0` y `pack_m3` válido:

```typescript
ratio_pack_vs_producto = pack_m3 / producto_m3
```

Este ratio indica cuánto más grande es el empaque respecto al producto.

##### 2. Estadísticas Globales

**Conteos:**
- Total de filas
- Filas con medidas completas del producto (ancho, fondo, alto)
- Filas con producto_m3
- Filas con medidas completas del pack
- Filas con pack_m3
- Filas con ratio calculado
- Filas marcadas como paquete_estimable
- Filas enriquecidas con Gemini

**Estadísticas numéricas:** Para `producto_m3`, `pack_m3` y `ratio_pack_vs_producto`:

```typescript
interface NumericStats {
  count: number,    // Cantidad de valores válidos
  mean: number,     // Promedio
  median: number,   // Mediana
  p25: number,      // Percentil 25
  p75: number       // Percentil 75
}
```

##### 3. Estadísticas Agrupadas

Si existen en los datos, calcula estadísticas por:

**Por Línea de Producto:**
- Total de filas en la línea
- Cantidad con pack_m3
- Cantidad con producto_m3
- Porcentaje con pack_m3
- Porcentaje con producto_m3
- Cantidad enriquecida con Gemini

**Por Familia:**
- Mismas métricas que por Línea

#### Archivos Generados

1. **stage7_final.json:** Dataset final con ratio calculado
2. **stage7_stats_global.json:** Estadísticas globales
3. **stage7_stats_by_linea.json:** Estadísticas por línea (si aplica)
4. **stage7_stats_by_familia.json:** Estadísticas por familia (si aplica)

#### Métricas

```typescript
{
  totalRows: number,
  conMedidasProducto: number,
  conProductoM3: number,
  conMedidasPack: number,
  conPackM3: number,
  conRatio: number,
  conPaqueteEstimable: number,
  conGemini: number,
  pctMedidasProducto: number,
  pctPackM3: number,
  pctGemini: number,
  finalPath: string,
  statsGlobalPath: string,
  statsByLineaPath: string | null,
  statsByFamiliaPath: string | null
}
```

#### Actualización del Job

- Estado global: `"completed"`
- Stage status: `"success"`

---

## 5. API REST - ENDPOINTS

### 5.1 POST /jobs

**Descripción:** Crea un nuevo job y sube un archivo Excel para procesamiento.

**Request:**
```http
POST /jobs HTTP/1.1
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="productos.xlsx"
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

[binary data]
--boundary--
```

**Validaciones:**
- Archivo requerido
- Formato: .xlsx o .xls
- Multer maneja el upload y validación de tipo

**Response exitosa (201):**
```json
{
  "jobId": "clx1234567890abcdef",
  "status": "created",
  "inputFilePath": "uploads/clx1234567890abcdef/input.xlsx"
}
```

**Errores posibles:**

| Código | Error | Descripción |
|--------|-------|-------------|
| 400 | NO_FILE | No se envió archivo |
| 400 | Invalid file type | Archivo no es Excel |
| 500 | JOB_CREATION_FAILED | Error al crear job en BD |

---

### 5.2 POST /jobs/:jobId/stage1

**Descripción:** Ejecuta la etapa 1 (Ingest & Normalize) del pipeline.

**Request:**
```http
POST /jobs/clx1234567890abcdef/stage1 HTTP/1.1
```

**Validaciones:**
- jobId requerido y no vacío
- Job debe existir
- inputFilePath debe existir
- Archivo debe existir en filesystem

**Response exitosa (200):**
```json
{
  "jobId": "clx1234567890abcdef",
  "stage": "stage1_ingest_normalize",
  "status": "success",
  "metrics": {
    "totalRows": 1500,
    "columns": ["EAN", "Descripcion", "Ancho", "Alto", "Fondo", "Linea", "Familia"],
    "fileSizeBytes": 245678
  }
}
```

**Errores posibles:**

| Código | Error | Descripción |
|--------|-------|-------------|
| 400 | INVALID_JOB_ID | jobId vacío o inválido |
| 404 | JOB_NOT_FOUND | Job no existe |
| 400 | INPUT_FILE_NOT_FOUND | Archivo Excel no encontrado |
| 500 | STAGE1_FAILED | Error en procesamiento |

---

### 5.3 POST /jobs/:jobId/stage2

**Descripción:** Ejecuta la etapa 2 (Paquete Estimable).

**Request:**
```http
POST /jobs/clx1234567890abcdef/stage2 HTTP/1.1
```

**Dependencia:** Stage 1 debe tener status "success"

**Response exitosa (200):**
```json
{
  "jobId": "clx1234567890abcdef",
  "stage": "stage2_paquete_estimable",
  "status": "success",
  "metrics": {
    "totalRows": 1500,
    "estimables": 1200,
    "pctEstimables": 80.0
  }
}
```

**Errores adicionales:**

| Código | Error | Descripción |
|--------|-------|-------------|
| 400 | STAGE1_NOT_READY | Stage 1 no completado |

---

### 5.4 POST /jobs/:jobId/stage3

**Descripción:** Ejecuta la etapa 3 (Normalize Measures).

**Dependencia:** Stage 2 debe tener status "success"

**Response exitosa (200):**
```json
{
  "jobId": "clx1234567890abcdef",
  "stage": "stage3_normalize_measures",
  "status": "success",
  "metrics": {
    "totalRows": 1500,
    "conMedidasCompletas": 1350,
    "conProductoM3": 1350
  }
}
```

---

### 5.5 POST /jobs/:jobId/stage4

**Descripción:** Ejecuta la etapa 4 (IA Enrichment con Gemini).

**Request:**
```http
POST /jobs/clx1234567890abcdef/stage4 HTTP/1.1
Content-Type: application/json

{
  "limit": 50
}
```

**Parámetros opcionales:**
- `limit` (number, default: 20): Cantidad máxima de registros a procesar

**Dependencia:** Stage 3 debe tener status "success"

**Response exitosa (200):**
```json
{
  "jobId": "clx1234567890abcdef",
  "stage": "stage4_ia_enrichment",
  "status": "processing",
  "metrics": {
    "totalRows": 1500,
    "totalCandidates": 300,
    "processedThisCall": 50,
    "totalEnriched": 50
  }
}
```

**Nota:** `status` puede ser "processing" (quedan candidatos) o "success" (todos procesados).

---

### 5.6 POST /jobs/:jobId/stage5

**Descripción:** Ejecuta la etapa 5 (Outliers Clean).

**Dependencia:** Stage 4 debe haber sido ejecutado (status "success" o "processing")

**Response exitosa (200):**
```json
{
  "jobId": "clx1234567890abcdef",
  "stage": "stage5_outliers_clean",
  "status": "success",
  "metrics": {
    "totalRows": 1500,
    "numOutliers": 45,
    "numClean": 1500,
    "numPackLimpiados": 45,
    "numProductoLimpiado": 12
  }
}
```

---

### 5.7 POST /jobs/:jobId/stage6

**Descripción:** Ejecuta la etapa 6 (Filter Sets).

**Dependencia:** Stage 5 debe tener status "success"

**Response exitosa (200):**
```json
{
  "jobId": "clx1234567890abcdef",
  "stage": "stage6_filter_sets",
  "status": "success",
  "metrics": {
    "totalRows": 1500,
    "numExcluded": 120,
    "numMain": 1380,
    "pctExcluded": 8.0
  }
}
```

---

### 5.8 POST /jobs/:jobId/stage7

**Descripción:** Ejecuta la etapa 7 (Stats - Final).

**Dependencia:** Stage 6 debe tener status "success"

**Response exitosa (200):**
```json
{
  "jobId": "clx1234567890abcdef",
  "stage": "stage7_stats",
  "status": "success",
  "metrics": {
    "totalRows": 1380,
    "conMedidasProducto": 1350,
    "conProductoM3": 1350,
    "conMedidasPack": 980,
    "conPackM3": 980,
    "conRatio": 980,
    "conPaqueteEstimable": 1200,
    "conGemini": 300,
    "pctMedidasProducto": 97.8,
    "pctPackM3": 71.0,
    "pctGemini": 21.7
  }
}
```

---

### 5.9 POST /jobs/:jobId/run

**Descripción:** Orquesta la ejecución secuencial del pipeline completo o parcial.

**Request:**
```http
POST /jobs/clx1234567890abcdef/run HTTP/1.1
Content-Type: application/json

{
  "fromStage": 1,
  "toStage": 7
}
```

**Parámetros opcionales:**
- `fromStage` (number, default: 1): Stage inicial (1-7)
- `toStage` (number, default: 7): Stage final (1-7)

**Validaciones:**
- fromStage y toStage deben ser enteros entre 1 y 7
- fromStage <= toStage
- Job debe existir

**Comportamiento:**
1. Recorre stages de fromStage a toStage
2. Si una stage ya tiene status "success" → la salta
3. Si una stage no está en success → la ejecuta
4. Si una stage falla → detiene el pipeline
5. Si completa todas las stages (1-7) → marca job como "completed"

**Response exitosa (200):**
```json
{
  "jobId": "clx1234567890abcdef",
  "fromStage": 1,
  "toStage": 7,
  "finalStatus": "success",
  "results": [
    {
      "stageNumber": 1,
      "stageKey": "stage1_ingest_normalize",
      "action": "executed",
      "status": "success"
    },
    {
      "stageNumber": 2,
      "stageKey": "stage2_paquete_estimable",
      "action": "executed",
      "status": "success"
    },
    {
      "stageNumber": 3,
      "stageKey": "stage3_normalize_measures",
      "action": "skipped",
      "status": "success"
    },
    {
      "stageNumber": 4,
      "stageKey": "stage4_ia_enrichment",
      "action": "executed",
      "status": "success"
    },
    {
      "stageNumber": 5,
      "stageKey": "stage5_outliers_clean",
      "action": "executed",
      "status": "success"
    },
    {
      "stageNumber": 6,
      "stageKey": "stage6_filter_sets",
      "action": "executed",
      "status": "success"
    },
    {
      "stageNumber": 7,
      "stageKey": "stage7_stats",
      "action": "executed",
      "status": "success"
    }
  ]
}
```

**Respuesta con fallo parcial:**
```json
{
  "jobId": "clx1234567890abcdef",
  "fromStage": 1,
  "toStage": 7,
  "finalStatus": "partial",
  "results": [
    {
      "stageNumber": 1,
      "stageKey": "stage1_ingest_normalize",
      "action": "executed",
      "status": "success"
    },
    {
      "stageNumber": 2,
      "stageKey": "stage2_paquete_estimable",
      "action": "failed",
      "status": "error",
      "errorMessage": "Stage 1 must be completed before Stage 2"
    }
  ]
}
```

**Estados de finalStatus:**
- `"success"`: Todas las stages completadas exitosamente
- `"partial"`: Algunas stages completadas, alguna falló
- `"error"`: Primera stage falló

**Errores posibles:**

| Código | Error | Descripción |
|--------|-------|-------------|
| 400 | INVALID_JOB_ID | jobId vacío |
| 400 | INVALID_STAGE_RANGE | Rango de stages inválido |
| 404 | JOB_NOT_FOUND | Job no existe |
| 500 | RUN_PIPELINE_FAILED | Error grave en orquestación |

---

### 5.10 GET /jobs

**Descripción:** Lista todos los jobs con paginación y filtrado opcional.

**Request:**
```http
GET /jobs?status=completed&limit=20&offset=0 HTTP/1.1
```

**Query parameters:**
- `status` (string, opcional): Filtrar por estado del job
- `limit` (number, default: 20, max: 100): Cantidad de resultados
- `offset` (number, default: 0): Cantidad de resultados a saltar

**Response (200):**
```json
{
  "items": [
    {
      "id": "clx1234567890abcdef",
      "createdAt": "2025-12-04T10:30:00.000Z",
      "status": "completed",
      "inputFilePath": "uploads/clx1234567890abcdef/input.xlsx",
      "stagesSummary": {
        "stage1_ingest_normalize": "success",
        "stage2_paquete_estimable": "success",
        "stage3_normalize_measures": "success",
        "stage4_ia_enrichment": "success",
        "stage5_outliers_clean": "success",
        "stage6_filter_sets": "success",
        "stage7_stats": "success"
      }
    }
  ],
  "total": 150,
  "limit": 20,
  "offset": 0
}
```

---

### 5.11 GET /jobs/:jobId

**Descripción:** Obtiene el detalle completo de un job específico.

**Request:**
```http
GET /jobs/clx1234567890abcdef HTTP/1.1
```

**Response (200):**
```json
{
  "id": "clx1234567890abcdef",
  "createdAt": "2025-12-04T10:30:00.000Z",
  "status": "completed",
  "inputFilePath": "uploads/clx1234567890abcdef/input.xlsx",
  "stages": {
    "stage1_ingest_normalize": {
      "status": "success",
      "metrics": {
        "totalRows": 1500,
        "columns": ["EAN", "Descripcion", ...],
        "fileSizeBytes": 245678
      }
    },
    "stage2_paquete_estimable": {
      "status": "success",
      "metrics": { ... }
    }
  },
  "summary": null
}
```

**Errores:**

| Código | Error | Descripción |
|--------|-------|-------------|
| 400 | INVALID_JOB_ID | jobId vacío |
| 404 | JOB_NOT_FOUND | Job no existe |

---

### 5.12 GET /jobs/:jobId/export

**Descripción:** Exporta el resultado final del pipeline en formato CSV o JSON.

**Request:**
```http
GET /jobs/clx1234567890abcdef/export?format=csv HTTP/1.1
```

**Query parameters:**
- `format` (string, default: "csv"): Formato de exportación ("csv" o "json")

**Dependencia:** Stage 7 debe tener status "success"

**Response CSV (200):**
```http
HTTP/1.1 200 OK
Content-Type: text/csv
Content-Disposition: attachment; filename="job-clx1234567890abcdef-final.csv"

EAN,Descripcion,ancho_cm,fondo_cm,alto_cm,producto_m3,...
1234567890123,"Sofá 3 plazas",220,95,85,1.7765,...
```

**Response JSON (200):**
```json
{
  "jobId": "clx1234567890abcdef",
  "count": 1380,
  "data": [
    {
      "EAN": "1234567890123",
      "Descripcion": "Sofá 3 plazas",
      "ancho_cm": 220,
      "fondo_cm": 95,
      "alto_cm": 85,
      "producto_m3": 1.7765,
      ...
    }
  ]
}
```

**Errores:**

| Código | Error | Descripción |
|--------|-------|-------------|
| 400 | INVALID_JOB_ID | jobId vacío |
| 404 | JOB_NOT_FOUND | Job no existe |
| 400 | STAGE7_NOT_READY | Stage 7 no completado |
| 500 | EXPORT_READ_FAILED | Error leyendo archivo final |
| 500 | EXPORT_FAILED | Error convirtiendo a CSV |

---

### 5.13 GET /health

**Descripción:** Health check del servidor.

**Request:**
```http
GET /health HTTP/1.1
```

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-12-04T15:45:30.123Z"
}
```

---

## 6. FLUJO DE DATOS

### 6.1 Flujo Completo del Pipeline

```
1. UPLOAD
   Cliente → POST /jobs + Excel file
   ↓
   Multer almacena → uploads/<jobId>/input.xlsx
   ↓
   Prisma crea Job → status: "created"
   ↓
   Response: { jobId, status, inputFilePath }

2. STAGE 1: INGEST
   Cliente → POST /jobs/:jobId/stage1
   ↓
   Lee Excel con XLSX
   ↓
   Convierte a JSON
   ↓
   Guarda → data/<jobId>/stage1_base.json
   ↓
   Actualiza Job → status: "ingested"
   ↓
   Response: { stage, status, metrics }

3. STAGE 2: CLASSIFY
   Cliente → POST /jobs/:jobId/stage2
   ↓
   Lee stage1_base.json
   ↓
   Clasifica paquete_estimable (keywords)
   ↓
   Guarda → data/<jobId>/stage2_paquete_estimable.json
   ↓
   Actualiza Job → status: "stage2_done"

4. STAGE 3: NORMALIZE
   Cliente → POST /jobs/:jobId/stage3
   ↓
   Lee stage2_paquete_estimable.json
   ↓
   Normaliza medidas a números
   ↓
   Calcula producto_m3
   ↓
   Guarda → data/<jobId>/stage3_medidas_normalizadas.json
   ↓
   Actualiza Job → status: "stage3_done"

5. STAGE 4: ENRICH (IA)
   Cliente → POST /jobs/:jobId/stage4 + { limit: 50 }
   ↓
   Lee stage3_medidas_normalizadas.json
   ↓
   Identifica candidatos (hasta 'limit')
   ↓
   Para cada candidato:
     → Llama Gemini API con EAN
     → Parsea respuesta JSON
     → Completa medidas faltantes
     → Marca gemini_enriched = true
   ↓
   Guarda → data/<jobId>/stage4_enriched.json
   ↓
   Actualiza Job → status: "processing" o "stage4_done"
   ↓
   (Repetir hasta procesar todos los candidatos)

6. STAGE 5: CLEAN OUTLIERS
   Cliente → POST /jobs/:jobId/stage5
   ↓
   Lee stage4_enriched.json
   ↓
   Para cada fila:
     → Evalúa 6 criterios de outlier
     → Si es outlier: limpia pack (y producto si aplica)
   ↓
   Guarda:
     → data/<jobId>/stage5_outliers.json (problemas)
     → data/<jobId>/stage5_clean.json (dataset limpio)
   ↓
   Actualiza Job → status: "stage5_done"

7. STAGE 6: FILTER SETS
   Cliente → POST /jobs/:jobId/stage6
   ↓
   Lee stage5_clean.json
   ↓
   Detecta conjuntos/sets (keywords)
   ↓
   Separa en dos datasets:
     → data/<jobId>/stage6_main_clean.json (principal)
     → data/<jobId>/stage6_excluded_sets.json (sets)
   ↓
   Actualiza Job → status: "stage6_done"

8. STAGE 7: STATISTICS
   Cliente → POST /jobs/:jobId/stage7
   ↓
   Lee stage6_main_clean.json
   ↓
   Calcula ratio_pack_vs_producto
   ↓
   Calcula estadísticas globales
   ↓
   Calcula estadísticas por Linea y Familia
   ↓
   Guarda:
     → data/<jobId>/stage7_final.json
     → data/<jobId>/stage7_stats_global.json
     → data/<jobId>/stage7_stats_by_linea.json
     → data/<jobId>/stage7_stats_by_familia.json
   ↓
   Actualiza Job → status: "completed"

9. EXPORT
   Cliente → GET /jobs/:jobId/export?format=csv
   ↓
   Lee stage7_final.json
   ↓
   Convierte a CSV con json2csv
   ↓
   Response: Archivo CSV descargable
```

### 6.2 Flujo con Orquestador

```
Cliente → POST /jobs/:jobId/run + { fromStage: 1, toStage: 7 }
↓
Orquestador:
  Para stage = 1 hasta 7:
    ↓
    ¿Stage ya en success?
      SÍ → Saltar (action: "skipped")
      NO → Ejecutar stage
        ↓
        ¿Éxito?
          SÍ → Continuar (action: "executed")
          NO → Detener pipeline (action: "failed")
    ↓
  Recalcular Job desde BD
  ↓
  Determinar finalStatus:
    - "success": todas exitosas
    - "partial": algunas exitosas, alguna falló
    - "error": primera falló
  ↓
  Si fromStage=1 && toStage=7 && todas exitosas:
    → Actualizar Job.status = "completed"
↓
Response: { jobId, fromStage, toStage, finalStatus, results[] }
```

---

## 7. MANEJO DE ERRORES Y RECUPERACIÓN

### 7.1 Estrategia General de Errores

Cada servicio (stage) implementa un patrón consistente:

```typescript
try {
  // Validaciones
  // Procesamiento
  // Persistencia
  // Actualización de estado a success
  return { success: true, metrics };
} catch (error) {
  // Log del error
  console.error('Error in Stage X:', error);

  // Actualizar estado del job a error
  try {
    const stages = JSON.parse(job.stages);
    stages.stageX = {
      status: 'error',
      errorMessage: error.message
    };
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'error',
        stages: JSON.stringify(stages)
      }
    });
  } catch (updateError) {
    console.error('Error updating job status:', updateError);
  }

  return { success: false, error: error.message };
}
```

### 7.2 Tipos de Errores

#### Errores de Validación (400 Bad Request)
- jobId faltante o vacío
- Archivo no enviado
- Formato de archivo incorrecto
- Parámetros fuera de rango (stage numbers)
- Stage previa no completada

**Respuesta típica:**
```json
{
  "error": "INVALID_JOB_ID",
  "message": "jobId is required in URL"
}
```

#### Errores de Recurso No Encontrado (404 Not Found)
- Job no existe
- Archivo no encontrado en filesystem

**Respuesta típica:**
```json
{
  "error": "JOB_NOT_FOUND",
  "message": "Job not found"
}
```

#### Errores de Procesamiento (500 Internal Server Error)
- Error al leer Excel
- Error al parsear JSON
- Error en llamada a Gemini API
- Error al escribir archivos
- Error de base de datos

**Respuesta típica:**
```json
{
  "error": "STAGE4_FAILED",
  "message": "Failed to parse Gemini response: Unexpected token"
}
```

### 7.3 Recuperación de Errores

#### Jobs en Estado Error

Un job en estado "error" puede ser recuperado:

1. **Identificar la stage fallida:** Consultar GET /jobs/:jobId y revisar el campo stages
2. **Verificar el errorMessage:** Entender la causa del fallo
3. **Corregir datos si es necesario:** Modificar archivos intermedios
4. **Reintentar la stage:** Llamar nuevamente POST /jobs/:jobId/stageX

**Ejemplo:**

```bash
# 1. Ver detalles del job
curl http://localhost:3000/jobs/clx123

# Response muestra:
# "stage3_normalize_measures": { "status": "error", "errorMessage": "..." }

# 2. Reintentar stage 3
curl -X POST http://localhost:3000/jobs/clx123/stage3

# 3. O ejecutar pipeline desde stage 3
curl -X POST http://localhost:3000/jobs/clx123/run \
  -H "Content-Type: application/json" \
  -d '{"fromStage": 3, "toStage": 7}'
```

#### Stage 4 (IA Enrichment) con Estado Processing

Si Stage 4 está en "processing" (no todos los candidatos procesados):

```bash
# Ejecutar nuevamente hasta completar
curl -X POST http://localhost:3000/jobs/clx123/stage4 \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'

# Repetir hasta que status === "success"
```

### 7.4 Idempotencia

**Stages idempotentes:**
- Stages 1-3, 5-7: Pueden ejecutarse múltiples veces sobre el mismo input sin efectos secundarios
- Resultado: Siempre el mismo dataset final

**Stage NO idempotente:**
- Stage 4: Cada ejecución consume créditos de API de Gemini
- Protección: Marca `gemini_enriched = true` para no reprocesar

---

## 8. SEGURIDAD Y VALIDACIONES

### 8.1 Validación de Entrada

#### Upload de Archivos
- **Extensiones permitidas:** .xlsx, .xls
- **Validación:** Multer fileFilter rechaza otros formatos
- **Almacenamiento:** Carpeta aislada por jobId

#### Parámetros de URL
- **jobId:** Validado no vacío, trim aplicado
- **Existencia:** Verificado contra base de datos antes de procesamiento

#### Body Parameters
- **fromStage, toStage:** Validados como enteros 1-7
- **Rango válido:** fromStage <= toStage
- **limit:** Validado como entero positivo, max razonable

#### Query Parameters
- **limit:** Máximo 100 registros por página
- **offset:** No negativo
- **status:** String libre (filtro flexible)

### 8.2 Protección de Recursos

#### Aislamiento de Jobs
```
uploads/<jobId>/     # Archivos de entrada aislados por job
data/<jobId>/        # Resultados aislados por job
```

No hay cross-contamination entre jobs.

#### API Keys
```typescript
// src/services/gemini.ts
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}
```

API key almacenado en variable de entorno, nunca en código.

### 8.3 Límites y Rate Limiting

#### Stage 4 (Gemini)
- **Límite por defecto:** 20 registros por llamada
- **Configurable:** vía body parameter `limit`
- **Propósito:** Controlar costos y timeouts

#### Paginación en GET /jobs
- **Límite máximo:** 100 registros
- **Default:** 20 registros
- **Propósito:** Evitar sobrecarga en respuestas grandes

### 8.4 Manejo de Datos Sensibles

#### Excel Files
- **Contenido:** Datos de productos (no PII típicamente)
- **Almacenamiento:** Local filesystem
- **Eliminación:** Manual (no auto-cleanup implementado)

#### Logs
- **Console logging:** Errores y eventos importantes
- **No logging:** Contenido de archivos o datos sensibles

### 8.5 CORS y Headers

**No configurado explícitamente en el código actual.**

Para producción, considerar:
```typescript
import cors from 'cors';
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  methods: ['GET', 'POST'],
  credentials: true
}));
```

---

## 9. ESTRUCTURA DEL PROYECTO

```
project/
├── src/
│   ├── server.ts                     # Punto de entrada, Express setup
│   ├── db/
│   │   └── prisma.ts                 # Cliente Prisma singleton
│   ├── routes/
│   │   └── jobs.ts                   # Rutas HTTP (11 endpoints)
│   ├── services/
│   │   ├── stage1.ts                 # Ingest & Normalize
│   │   ├── stage2.ts                 # Paquete Estimable
│   │   ├── stage3.ts                 # Normalize Measures
│   │   ├── stage4.ts                 # IA Enrichment
│   │   ├── stage5.ts                 # Outliers Clean
│   │   ├── stage6.ts                 # Filter Sets
│   │   ├── stage7.ts                 # Stats
│   │   └── gemini.ts                 # Google Gemini integration
│   └── types/
│       └── job.ts                    # TypeScript interfaces
│
├── prisma/
│   ├── schema.prisma                 # Modelo de datos
│   ├── dev.db                        # SQLite database (generado)
│   └── migrations/
│       ├── migration_lock.toml
│       └── 20251204094407_init/
│           └── migration.sql
│
├── uploads/                          # Archivos Excel (generado)
│   └── <jobId>/
│       └── input.xlsx
│
├── data/                             # Resultados intermedios (generado)
│   └── <jobId>/
│       ├── stage1_base.json
│       ├── stage2_paquete_estimable.json
│       ├── stage3_medidas_normalizadas.json
│       ├── stage4_enriched.json
│       ├── stage5_outliers.json
│       ├── stage5_clean.json
│       ├── stage6_main_clean.json
│       ├── stage6_excluded_sets.json
│       ├── stage7_final.json
│       ├── stage7_stats_global.json
│       ├── stage7_stats_by_linea.json
│       └── stage7_stats_by_familia.json
│
├── dist/                             # Compilado TypeScript (generado)
│   └── ...
│
├── node_modules/                     # Dependencias (generado)
│
├── package.json                      # Dependencias y scripts
├── package-lock.json
├── tsconfig.json                     # Configuración TypeScript
├── .env                              # Variables de entorno
├── .gitignore
└── README.md                         # Documentación básica
```

### 9.1 Líneas de Código por Archivo

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| src/server.ts | 20 | Setup básico Express |
| src/routes/jobs.ts | 952 | Rutas + Orquestador |
| src/services/stage1.ts | 117 | Ingesta Excel |
| src/services/stage2.ts | 160 | Clasificación |
| src/services/stage3.ts | 183 | Normalización |
| src/services/stage4.ts | 223 | Enriquecimiento IA |
| src/services/stage5.ts | 256 | Limpieza outliers |
| src/services/stage6.ts | 164 | Filtrado sets |
| src/services/stage7.ts | 330 | Estadísticas |
| src/services/gemini.ts | ~50 | Integración Gemini |
| src/types/job.ts | 29 | Tipos TypeScript |
| **TOTAL** | **~2,484** | Líneas de código efectivas |

---

## 10. DEPENDENCIAS Y TECNOLOGÍAS

### 10.1 Dependencias de Producción

```json
{
  "@google/generative-ai": "^0.24.1",    // Google Gemini API client
  "@prisma/client": "^5.7.0",            // Prisma ORM client
  "@types/json2csv": "^5.0.7",           // Tipos para json2csv
  "express": "^4.18.2",                  // Framework HTTP
  "json2csv": "^6.0.0-alpha.2",          // Conversión JSON a CSV
  "multer": "^1.4.5-lts.1",              // Upload de archivos multipart
  "xlsx": "^0.18.5"                      // Lectura de archivos Excel
}
```

### 10.2 Dependencias de Desarrollo

```json
{
  "@types/express": "^4.17.21",          // Tipos TypeScript para Express
  "@types/multer": "^1.4.11",            // Tipos TypeScript para Multer
  "@types/node": "^20.10.0",             // Tipos TypeScript para Node
  "prisma": "^5.7.0",                    // CLI de Prisma
  "ts-node-dev": "^2.0.0",               // Hot reload TypeScript
  "typescript": "^5.3.2"                 // Compilador TypeScript
}
```

### 10.3 Stack Tecnológico Detallado

#### Runtime
- **Node.js:** v20.x recomendado
- **TypeScript:** 5.3.2
- **Compilación:** tsc (TypeScript Compiler)

#### Framework HTTP
- **Express:** 4.18.2
- **Middleware:**
  - express.json() - Body parser JSON
  - express.urlencoded() - Body parser URL encoded
  - multer - File uploads

#### Base de Datos
- **SQLite:** Archivo local embebido
- **ORM:** Prisma 5.7.0
- **Migraciones:** Prisma Migrate

#### Procesamiento de Datos
- **xlsx:** Lectura y parseo de Excel
- **json2csv:** Conversión JSON a CSV
- **fs (Node.js built-in):** File system operations

#### Inteligencia Artificial
- **Google Gemini:** gemini-1.5-flash model
- **Cliente:** @google/generative-ai
- **Uso:** Enriquecimiento de datos faltantes

---

## 11. OPERACIONES Y DEPLOYMENT

### 11.1 Variables de Entorno

```bash
# .env
PORT=3000
GEMINI_API_KEY=your_google_gemini_api_key_here
```

### 11.2 Scripts NPM

```json
{
  "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  "prisma:migrate": "prisma migrate dev",
  "prisma:generate": "prisma generate",
  "prisma:studio": "prisma studio"
}
```

### 11.3 Instalación y Setup

```bash
# 1. Clonar repositorio e instalar dependencias
npm install

# 2. Crear base de datos y ejecutar migraciones
npm run prisma:migrate

# 3. Generar cliente Prisma
npm run prisma:generate

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env con GEMINI_API_KEY

# 5. Ejecutar en desarrollo
npm run dev
```

### 11.4 Deployment a Producción

```bash
# 1. Compilar TypeScript
npm run build

# 2. Ejecutar migraciones en producción
npx prisma migrate deploy

# 3. Generar cliente Prisma
npx prisma generate

# 4. Iniciar servidor
npm start
```

### 11.5 Monitoreo

#### Health Check
```bash
curl http://localhost:3000/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "timestamp": "2025-12-04T15:45:30.123Z"
}
```

#### Database Check
```bash
# Abrir Prisma Studio (GUI)
npm run prisma:studio

# Acceder en: http://localhost:5555
```

### 11.6 Logs

**Actual:** Console logging

```typescript
console.log('Server running on port', PORT);
console.error('Error in Stage 1:', error);
```

**Recomendación para producción:**
- Winston o Pino para structured logging
- Log rotation
- Log aggregation (ELK stack, CloudWatch, etc.)

---

## 12. MÉTRICAS Y OBSERVABILIDAD

### 12.1 Métricas por Stage

Cada stage captura y persiste métricas específicas:

#### Stage 1
- Total de filas ingresadas
- Columnas detectadas
- Tamaño del archivo en bytes

#### Stage 2
- Total de filas
- Cantidad de productos estimables
- Porcentaje de estimables

#### Stage 3
- Total de filas
- Filas con medidas completas del producto
- Filas con producto_m3 calculado

#### Stage 4
- Total de filas
- Total de candidatos para IA
- Procesados en esta llamada
- Total enriquecidos acumulado

#### Stage 5
- Total de filas
- Cantidad de outliers detectados
- Empaques limpiados
- Productos limpiados

#### Stage 6
- Total de filas
- Cantidad de sets excluidos
- Cantidad en dataset principal
- Porcentaje de exclusión

#### Stage 7
- Total de filas finales
- Cobertura de medidas (%)
- Cobertura de pack_m3 (%)
- Cobertura de enriquecimiento IA (%)
- Estadísticas descriptivas completas

### 12.2 Tracking de Jobs

Cada job mantiene:
- **ID único:** CUID generado automáticamente
- **Timestamp:** createdAt
- **Estado global:** status (created → ingested → stageX_done → completed/error)
- **Estado por stage:** En campo stages (JSON)
- **Métricas acumuladas:** En cada stage dentro del JSON

### 12.3 Consultas de Monitoreo

```bash
# Listar todos los jobs completados
curl http://localhost:3000/jobs?status=completed

# Listar jobs en error
curl http://localhost:3000/jobs?status=error

# Ver detalles de un job específico
curl http://localhost:3000/jobs/clx123

# Ver estadísticas finales de un job
curl http://localhost:3000/jobs/clx123/export?format=json | jq '.data | length'
```

### 12.4 Observabilidad Futura

**Recomendaciones:**

1. **APM (Application Performance Monitoring):**
   - New Relic, DataDog, o Elastic APM
   - Tracking de request latency
   - Detección de errores automática

2. **Métricas de Negocio:**
   - Dashboard con totales de jobs procesados
   - Tasa de éxito/fallo por stage
   - Tiempo promedio de procesamiento
   - Uso de créditos de Gemini API

3. **Alertas:**
   - Job en estado error > 1 hora
   - Tasa de fallo > 10%
   - Latencia de API > 30s
   - Disco lleno (uploads/data)

4. **Tracing Distribuido:**
   - OpenTelemetry para tracing end-to-end
   - Correlación de requests a través de stages

---

## CONCLUSIÓN

Este microservicio implementa un **pipeline robusto y extensible** para procesamiento de datos de productos con las siguientes fortalezas:

### Puntos Destacados

1. **Arquitectura Modular:** Separación clara de responsabilidades (routes, services, data)
2. **Pipeline Flexible:** Ejecución por etapas individuales o completa
3. **Inteligencia Artificial:** Integración con Gemini para enriquecimiento de datos
4. **Manejo de Errores:** Recuperación granular por stage
5. **Observabilidad:** Métricas detalladas en cada etapa
6. **Type Safety:** TypeScript end-to-end
7. **Persistencia Dual:** Base de datos (metadata) + File system (datos)
8. **API RESTful:** 11 endpoints bien documentados

### Características Técnicas

- **2,484 líneas de código** efectivas
- **7 etapas de procesamiento** secuenciales
- **11 endpoints HTTP** RESTful
- **8 servicios** independientes
- **Soporte para archivos Excel** (.xlsx, .xls)
- **Exportación múltiple formato** (CSV, JSON)
- **Enriquecimiento con IA** (Google Gemini)
- **Detección avanzada de outliers** (6 criterios)
- **Estadísticas descriptivas** (global y agrupadas)

### Casos de Uso

- Procesamiento batch de catálogos de productos
- Normalización de medidas de productos y empaques
- Enriquecimiento de datos faltantes con IA
- Detección de anomalías en dimensiones
- Cálculo de estadísticas de volumen y ratios
- Preparación de datos para sistemas de logística/inventario

---

**Documento generado:** 4 de Diciembre de 2025
**Versión del sistema:** 1.0.0
**Autor:** Sistema de Documentación Automatizada
