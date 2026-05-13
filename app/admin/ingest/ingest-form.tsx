'use client';

import { useState, useRef } from 'react';

interface IngestResult {
  success: boolean;
  filename?: string;
  title?: string;
  chunks_extracted?: number;
  chunks_embedded?: number;
  chunks_inserted?: number;
  text_length?: number;
  error?: string;
}

export function IngestForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fileInputRef.current?.files?.[0]) {
      setResult({ success: false, error: 'No file selected' });
      return;
    }

    const file = fileInputRef.current.files[0];
    if (!file.name.endsWith('.pdf')) {
      setResult({ success: false, error: 'Only PDF files are supported' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title || file.name.replace('.pdf', ''));

      const response = await fetch('/api/admin/ingest', {
        method: 'POST',
        body: formData,
      });

      const data: IngestResult = await response.json();

      if (!response.ok) {
        setResult({ success: false, error: data.error });
      } else {
        setResult(data);
        setTitle('');
        setFileName('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title input */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Document Title (optional)
        </label>
        <p className="text-xs text-muted-foreground mt-1">
          If blank, the PDF filename will be used. This appears in RAG metadata.
        </p>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., 'Sedra & Smith Chapter 3: Diodes'"
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={loading}
        />
      </div>

      {/* File input */}
      <div>
        <label htmlFor="file" className="block text-sm font-medium">
          PDF File
        </label>
        <p className="text-xs text-muted-foreground mt-1">
          Max 50 MB. Text-based PDFs only (not scanned images).
        </p>
        <input
          id="file"
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setFileName(file?.name || '');
          }}
          className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          disabled={loading}
        />
        {fileName && (
          <p className="text-xs text-muted-foreground mt-2">
            Selected: <code className="bg-muted px-2 py-1 rounded">{fileName}</code>
          </p>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={!fileInputRef.current?.files?.[0] || loading}
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Processing...' : 'Ingest PDF'}
      </button>

      {/* Results */}
      {result && (
        <div
          className={`rounded-lg p-4 text-sm ${
            result.success
              ? 'bg-green-50 text-green-900 border border-green-200'
              : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          {result.success ? (
            <>
              <p className="font-semibold">✓ Success</p>
              <p className="mt-2">
                <strong>{result.filename}</strong> ({result.text_length} chars)
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>• Extracted: {result.chunks_extracted} chunks</li>
                <li>• Embedded (vector): {result.chunks_embedded ?? result.chunks_inserted} chunks</li>
                <li>• Stored in KB: {result.chunks_inserted} chunks</li>
                {typeof result.chunks_embedded === 'number' &&
                  typeof result.chunks_extracted === 'number' &&
                  result.chunks_embedded < result.chunks_extracted ? (
                  <li className="text-amber-700">
                    ⚠ {result.chunks_extracted - result.chunks_embedded} chunks stored without embedding
                    (lexical search only — check Voyage API key / rate limits)
                  </li>
                ) : null}
                <li>• Title: {result.title}</li>
              </ul>
              <p className="mt-3 text-xs">
                Try searching in <code className="bg-black/10 px-1 rounded">/library</code> for
                circuits related to this document.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">✗ Error</p>
              <p className="mt-1">{result.error}</p>
            </>
          )}
        </div>
      )}
    </form>
  );
}
