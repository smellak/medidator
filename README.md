# Medidas Processor - Microservicio Backend

Microservicio backend en Node.js + TypeScript para procesar medidas de productos desde archivos Excel.

## Stack Tecnológico

- Node.js + TypeScript
- Express (framework HTTP)
- Prisma (ORM)
- SQLite (base de datos local)
- Multer (manejo de archivos multipart)
- xlsx (lectura de archivos Excel)

## Estructura del Proyecto

```
project/
├── src/
│   ├── server.ts           # Arranque del servidor Express
│   ├── routes/
│   │   └── jobs.ts         # Rutas relacionadas con jobs
│   ├── services/
│   │   └── stage1.ts       # Lógica de Stage 1: ingesta y normalización
│   ├── db/
│   │   └── prisma.ts       # Cliente de Prisma
│   └── types/
│       └── job.ts          # Tipos y constantes de Job
├── prisma/
│   └── schema.prisma       # Modelo de datos de Prisma
├── uploads/                # Carpeta de archivos Excel subidos (generada automáticamente)
├── data/                   # Carpeta de datos procesados (generada automáticamente)
└── package.json
```

## Instalación

1. Instalar dependencias:

```bash
npm install
```

2. Ejecutar migraciones de Prisma:

```bash
npm run prisma:migrate
```

Este comando creará la base de datos SQLite y aplicará las migraciones.

3. Generar el cliente de Prisma:

```bash
npm run prisma:generate
```

## Ejecución

### Modo desarrollo

```bash
npm run dev
```

El servidor se ejecutará en `http://localhost:3000` con recarga automática.

### Modo producción

```bash
npm run build
npm start
```

## API Endpoints

### POST /jobs

Crea un nuevo job para procesar un archivo Excel.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `file`: archivo Excel (.xlsx o .xls)

**Response exitosa (201):**
```json
{
  "jobId": "clx1234567890",
  "status": "created",
  "inputFilePath": "uploads/clx1234567890/input.xlsx"
}
```

**Response error - sin archivo (400):**
```json
{
  "error": "NO_FILE",
  "message": "No file uploaded"
}
```

**Response error - creación fallida (500):**
```json
{
  "error": "JOB_CREATION_FAILED",
  "message": "..."
}
```

### POST /jobs/:jobId/stage1

Ejecuta la etapa 1 del pipeline: ingesta y normalización del archivo Excel.

**Request:**
- URL Parameter: `jobId` (ID del job creado previamente)

**Response exitosa (200):**
```json
{
  "jobId": "clx1234567890",
  "stage": "stage1_ingest_normalize",
  "status": "success",
  "metrics": {
    "totalRows": 150,
    "columns": ["Producto", "Medida", "Precio", "Stock"],
    "fileSizeBytes": 45678
  }
}
```

**Response error - job no encontrado (404):**
```json
{
  "error": "JOB_NOT_FOUND",
  "message": "Job not found"
}
```

**Response error - archivo no encontrado (400):**
```json
{
  "error": "INPUT_FILE_NOT_FOUND",
  "message": "Input file not found at ..."
}
```

**Response error - fallo en procesamiento (500):**
```json
{
  "error": "STAGE1_FAILED",
  "message": "..."
}
```

### GET /health

Verifica el estado del servidor.

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-12-04T10:30:00.000Z"
}
```

## Ejemplo de Uso con curl

**Crear un job:**
```bash
curl -X POST http://localhost:3000/jobs \
  -F "file=@/ruta/a/tu/archivo.xlsx"
```

**Ejecutar Stage 1:**
```bash
curl -X POST http://localhost:3000/jobs/clx1234567890/stage1
```

## Modelo de Datos

### Job

```prisma
model Job {
  id            String   @id @default(cuid())
  createdAt     DateTime @default(now())
  status        String   // "created", "ingested", "processing", "done", "error"
  inputFilePath String   // ruta al archivo subido
  stages        String   // JSON con el estado de cada stage del pipeline
  summary       String?  // métricas/resumen final del job
}
```

### Estructura de Stages

Cuando se crea un Job, el campo `stages` contiene:

```json
{
  "stage1_ingest_normalize": { "status": "pending" },
  "stage2_paquete_estimable": { "status": "pending" },
  "stage3_normalize_measures": { "status": "pending" },
  "stage4_ia_enrichment": { "status": "pending" },
  "stage5_outliers_clean": { "status": "pending" },
  "stage6_filter_sets": { "status": "pending" },
  "stage7_stats": { "status": "pending" }
}
```

## Scripts Disponibles

- `npm run dev` - Inicia el servidor en modo desarrollo
- `npm run build` - Compila TypeScript a JavaScript
- `npm start` - Inicia el servidor en modo producción
- `npm run prisma:migrate` - Ejecuta migraciones de Prisma
- `npm run prisma:generate` - Genera el cliente de Prisma
- `npm run prisma:studio` - Abre Prisma Studio (GUI para la BD)

## Pipeline de Procesamiento

### Stage 1: Ingest & Normalize (Implementado)

Esta etapa lee el archivo Excel y genera un JSON base con los datos:

1. Lee el Excel usando la librería `xlsx`
2. Extrae la primera hoja del archivo
3. Convierte los datos a un array de objetos JSON
4. Guarda el resultado en `data/<jobId>/stage1_base.json`
5. Calcula métricas: total de filas, columnas, y tamaño del archivo
6. Actualiza el estado del job a `"ingested"`

**Archivo generado:**
- `data/<jobId>/stage1_base.json` - Array de objetos con los datos del Excel

### Próximas Etapas

- Stage 2: Paquete Estimable
- Stage 3: Normalize Measures
- Stage 4: IA Enrichment
- Stage 5: Outliers Clean
- Stage 6: Filter Sets
- Stage 7: Stats
