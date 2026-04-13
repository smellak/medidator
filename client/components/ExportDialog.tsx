import { useState } from 'react';
import { X, Download, FileSpreadsheet, FileText } from 'lucide-react';

interface Props {
  jobId: string;
  onClose: () => void;
}

type Format = 'csv' | 'xlsx';
type Tipo = '' | 'mueble' | 'electrodomestico' | 'accesorio' | 'otro';

interface ColumnGroup {
  label: string;
  cols: { id: string; label: string }[];
}

const COLUMN_GROUPS: ColumnGroup[] = [
  {
    label: 'Datos básicos',
    cols: [
      { id: 'COD_ARTICULO', label: 'COD_ARTICULO (siempre)' },
      { id: 'DESCRIPCION', label: 'DESCRIPCION' },
      { id: 'FAMILIA', label: 'FAMILIA' },
      { id: 'TIPO', label: 'TIPO' },
      { id: 'EAN', label: 'EAN' },
      { id: 'PROVEEDOR', label: 'PROVEEDOR' },
      { id: 'PROGRAMA', label: 'PROGRAMA' },
      { id: 'MARCA', label: 'MARCA' },
      { id: 'LINEA', label: 'LINEA' },
    ],
  },
  {
    label: 'Medidas de producto',
    cols: [
      { id: 'ANCHO_CM', label: 'ANCHO_CM' },
      { id: 'ALTO_CM', label: 'ALTO_CM' },
      { id: 'PROFUNDIDAD_CM', label: 'PROFUNDIDAD_CM' },
      { id: 'VOLUMEN_PRODUCTO_M3', label: 'VOLUMEN_PRODUCTO_M3' },
      { id: 'PESO_NETO_KG', label: 'PESO_NETO_KG' },
      { id: 'PESO_BRUTO_KG', label: 'PESO_BRUTO_KG' },
    ],
  },
  {
    label: 'Logística',
    cols: [
      { id: 'VOLUMEN_PAQUETE_M3', label: 'VOLUMEN_PAQUETE_M3' },
      { id: 'BULTOS', label: 'BULTOS' },
      { id: 'CAPA', label: 'CAPA (1=real, 2=gemini, 3=ratio, 4=heurística)' },
      { id: 'CONFIDENCE', label: 'CONFIDENCE (0-1)' },
      { id: 'ESTIMATION_SOURCE', label: 'ESTIMATION_SOURCE (detalle)' },
    ],
  },
  {
    label: 'Calidad',
    cols: [
      { id: 'PARSE_CONFIDENCE', label: 'PARSE_CONFIDENCE' },
      { id: 'SOURCE', label: 'SOURCE (html/merged/...)' },
      { id: 'COMPOSITE', label: 'COMPOSITE (SI/NO)' },
      { id: 'NUM_COMPONENTS', label: 'NUM_COMPONENTS' },
      { id: 'OUTLIER_WARNING', label: 'OUTLIER_WARNING (SI/NO)' },
      { id: 'CATEGORY', label: 'CATEGORY' },
    ],
  },
];

const PRESETS: Record<string, { label: string; columns: string[] }> = {
  basic: {
    label: 'Logística básica',
    columns: ['COD_ARTICULO', 'DESCRIPCION', 'VOLUMEN_PAQUETE_M3'],
  },
  full: {
    label: 'Logística completa',
    columns: ['COD_ARTICULO', 'DESCRIPCION', 'VOLUMEN_PAQUETE_M3', 'BULTOS', 'PESO_BRUTO_KG', 'CAPA', 'CONFIDENCE'],
  },
  measures: {
    label: 'Medidas producto',
    columns: ['COD_ARTICULO', 'DESCRIPCION', 'ANCHO_CM', 'ALTO_CM', 'PROFUNDIDAD_CM', 'VOLUMEN_PRODUCTO_M3'],
  },
  all: {
    label: 'Todo',
    columns: COLUMN_GROUPS.flatMap(g => g.cols.map(c => c.id)),
  },
};

const DEFAULT_COLUMNS = PRESETS.basic.columns;

export default function ExportDialog({ jobId, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_COLUMNS));
  const [format, setFormat] = useState<Format>('csv');
  const [capaFilter, setCapaFilter] = useState<string>(''); // '' | '1' | '2' | '3' | '4' | '1,2'
  const [confMin, setConfMin] = useState<number>(0);
  const [tipoFilter, setTipoFilter] = useState<Tipo>('');
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const toggleColumn = (id: string) => {
    if (id === 'COD_ARTICULO') return; // always selected
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyPreset = (key: keyof typeof PRESETS) => {
    setSelected(new Set(PRESETS[key].columns));
  };

  const buildUrl = (): string => {
    const cols = Array.from(selected);
    // Ensure COD_ARTICULO first
    const ordered = ['COD_ARTICULO', ...cols.filter(c => c !== 'COD_ARTICULO')];
    const qs = new URLSearchParams();
    qs.set('columns', ordered.join(','));
    qs.set('format', format);
    if (capaFilter) qs.set('capa', capaFilter);
    if (confMin > 0) qs.set('confidence_min', String(confMin));
    if (tipoFilter) qs.set('tipo', tipoFilter);
    return `/jobs/${jobId}/export/custom?${qs.toString()}`;
  };

  const handleDownload = async () => {
    const url = buildUrl();
    setDownloading(true);
    setExportError(null);
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        let msg = `Error ${resp.status}`;
        try {
          const err = await resp.json();
          msg = err.error || msg;
        } catch { /* ignore */ }
        setExportError(msg);
        return;
      }
      const blob = await resp.blob();
      const filename = format === 'xlsx'
        ? `medidator_${jobId}_custom.xlsx`
        : `medidator_${jobId}_custom.csv`;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      setExportError(e.message || 'Error de red al exportar');
    } finally {
      setDownloading(false);
    }
  };

  const totalSelected = selected.size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10, 22, 40, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-border rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-text-primary" style={{ fontFamily: 'var(--font-inter)' }}>
              Exportación personalizada
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Selecciona columnas, filtros y formato
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-5 flex-1">
          {/* Presets */}
          <div>
            <p className="text-[10px] font-semibold text-text-secondary uppercase mb-2" style={{ letterSpacing: '1px' }}>
              Presets rápidos
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map(key => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className="px-3 py-1.5 text-xs font-medium bg-surface border border-border text-text-primary rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  style={{ fontFamily: 'var(--font-inter)' }}
                >
                  {PRESETS[key].label}
                </button>
              ))}
            </div>
          </div>

          {/* Columns grid */}
          <div>
            <p className="text-[10px] font-semibold text-text-secondary uppercase mb-2" style={{ letterSpacing: '1px' }}>
              Columnas ({totalSelected} seleccionadas)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {COLUMN_GROUPS.map(group => (
                <div key={group.label} className="bg-surface border border-border rounded-md p-3">
                  <p className="text-xs font-bold text-text-primary mb-2" style={{ fontFamily: 'var(--font-inter)' }}>
                    {group.label}
                  </p>
                  <div className="space-y-1.5">
                    {group.cols.map(col => {
                      const isCodArticulo = col.id === 'COD_ARTICULO';
                      const isChecked = selected.has(col.id);
                      return (
                        <label
                          key={col.id}
                          className={`flex items-center gap-2 text-xs ${isCodArticulo ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isCodArticulo}
                            onChange={() => toggleColumn(col.id)}
                            className="w-3.5 h-3.5 accent-chs-primary"
                          />
                          <span className="text-text-primary">{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div>
            <p className="text-[10px] font-semibold text-text-secondary uppercase mb-2" style={{ letterSpacing: '1px' }}>
              Filtros (opcional)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-surface border border-border rounded-md p-3">
                <label className="text-xs font-medium text-text-primary block mb-1">Capa</label>
                <select
                  value={capaFilter}
                  onChange={e => setCapaFilter(e.target.value)}
                  className="w-full text-xs border border-border rounded px-2 py-1 bg-white"
                >
                  <option value="">Todas</option>
                  <option value="1">1 · ERP real</option>
                  <option value="2">2 · Gemini embalaje</option>
                  <option value="3">3 · Ratio</option>
                  <option value="4">4 · Heurística</option>
                  <option value="1,2">1+2 (alta confianza)</option>
                </select>
              </div>

              <div className="bg-surface border border-border rounded-md p-3">
                <label className="text-xs font-medium text-text-primary block mb-1">
                  Confianza mínima: <span className="font-bold">{confMin.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={confMin}
                  onChange={e => setConfMin(Number(e.target.value))}
                  className="w-full accent-chs-primary"
                />
              </div>

              <div className="bg-surface border border-border rounded-md p-3">
                <label className="text-xs font-medium text-text-primary block mb-1">Tipo</label>
                <select
                  value={tipoFilter}
                  onChange={e => setTipoFilter(e.target.value as Tipo)}
                  className="w-full text-xs border border-border rounded px-2 py-1 bg-white"
                >
                  <option value="">Todos</option>
                  <option value="mueble">Mueble</option>
                  <option value="electrodomestico">Electrodoméstico</option>
                  <option value="accesorio">Accesorio</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>
          </div>

          {/* Format */}
          <div>
            <p className="text-[10px] font-semibold text-text-secondary uppercase mb-2" style={{ letterSpacing: '1px' }}>
              Formato
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat('csv')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  format === 'csv'
                    ? 'bg-blue-50 border-blue-400 text-blue-800'
                    : 'bg-surface border-border text-text-primary hover:bg-gray-50'
                }`}
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                <FileText className="w-4 h-4" /> CSV
              </button>
              <button
                onClick={() => setFormat('xlsx')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  format === 'xlsx'
                    ? 'bg-blue-50 border-blue-400 text-blue-800'
                    : 'bg-surface border-border text-text-primary hover:bg-gray-50'
                }`}
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                <FileSpreadsheet className="w-4 h-4" /> Excel (.xlsx)
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-surface">
          {exportError && (
            <div className="px-6 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
              ⚠ {exportError}
            </div>
          )}
          <div className="flex items-center justify-between px-6 py-4">
            <p className="text-xs text-text-secondary font-mono truncate max-w-md" title={buildUrl()}>
              {buildUrl()}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-text-primary bg-surface-card border border-border rounded-md hover:bg-gray-50 transition-colors"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDownload}
                disabled={totalSelected === 0 || downloading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  fontFamily: 'var(--font-inter)',
                  background: 'linear-gradient(135deg, #0891B2, #0e7490)',
                }}
              >
                <Download className="w-4 h-4" /> {downloading ? 'Descargando…' : 'Descargar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
