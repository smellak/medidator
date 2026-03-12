import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle } from 'lucide-react';
import type { Job } from '../types';
import { createJob } from '../api';

interface Props {
  onJobCreated: (job: Job) => void;
}

export default function UploadForm({ onJobCreated }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
      setFile(f);
      setMessage(null);
    } else if (f) {
      setMessage({ type: 'error', text: 'Solo se aceptan archivos Excel (.xlsx, .xls)' });
    }
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const job = await createJob(file);
      onJobCreated(job);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setMessage({ type: 'success', text: `Job ${job.id} creado correctamente` });
      setTimeout(() => setMessage(null), 4000);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`bg-surface-card border rounded-lg shadow-sm transition-all ${
        dragOver ? 'ring-2 ring-app-primary border-app-primary' : 'border-border'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
    >
      <div className="p-5">
        <h2 className="text-base font-bold text-text-primary mb-3" style={{ fontFamily: 'var(--font-inter)' }}>
          Subir Archivo Excel
        </h2>

        <div className="border-2 border-dashed border-border rounded-md p-6 text-center hover:border-app-primary transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          {file ? (
            <FileSpreadsheet className="w-10 h-10 mx-auto text-app-primary mb-2" />
          ) : (
            <Upload className="w-10 h-10 mx-auto text-text-muted mb-2" />
          )}
          <p className="text-text-secondary text-sm">
            {file ? file.name : 'Arrastra un archivo .xlsx aquí o haz clic para seleccionar'}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {file && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="px-5 py-2 rounded-md text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{
                fontFamily: 'var(--font-inter)',
                background: 'linear-gradient(135deg, #1565C0, #1976D2)',
                border: '1px solid rgba(21, 101, 192, 0.6)',
              }}
            >
              {uploading ? 'Subiendo...' : 'Crear Job'}
            </button>
          </div>
        )}

        {message && (
          <div className={`mt-3 flex items-center gap-2 px-4 py-2.5 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-700'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
