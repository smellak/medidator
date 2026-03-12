import { useState, useRef } from 'react';
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
      className={`bg-white rounded-xl shadow-sm p-6 transition-all ${dragOver ? 'ring-2 ring-chs-primary bg-chs-light' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
    >
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Subir Archivo Excel</h2>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-chs-primary transition-colors">
        <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-gray-500 text-sm mb-3">
          {file ? file.name : 'Arrastra un archivo Excel aquí o haz clic para seleccionar'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Seleccionar Archivo
          </button>
          {file && (
            <button
              onClick={handleSubmit}
              disabled={uploading}
              className="px-4 py-2 bg-chs-primary text-white rounded-lg text-sm font-medium hover:bg-chs-dark transition-colors disabled:opacity-50"
            >
              {uploading ? 'Subiendo...' : 'Crear Job'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`mt-3 px-4 py-2 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-chs-success-light text-chs-success'
            : 'bg-chs-error-light text-chs-error'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
