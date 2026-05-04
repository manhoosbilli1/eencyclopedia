/**
 * Client-side utilities for exporting schematic content.
 *
 * All functions run in the browser — do NOT import from 'next/server' or
 * any server-only module here.
 */

import type { EditorState } from '@/components/schematic/editorTypes';

// ---------------------------------------------------------------------------
// PNG export
// ---------------------------------------------------------------------------

/**
 * Export the SVG canvas element to a PNG Blob.
 *
 * Steps:
 *   1. Serialise the SVGSVGElement to an XML string.
 *   2. Create an Image with a `data:image/svg+xml` URL.
 *   3. Draw the image onto an offscreen <canvas> at the requested scale.
 *   4. Return canvas.toBlob() as PNG.
 *
 * @param svgElement - The live SVGSVGElement in the DOM.
 * @param scale      - Pixel multiplier (default 2 for HiDPI / Retina).
 */
export async function exportToPng(
  svgElement: SVGSVGElement,
  scale = 2,
): Promise<Blob> {
  const serialiser = new XMLSerializer();
  const svgString = serialiser.serializeToString(svgElement);

  // Prepend the XML declaration so browsers decode it correctly.
  const svgWithXmlDecl =
    svgString.startsWith('<?xml')
      ? svgString
      : `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

  const dataUrl =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgWithXmlDecl);

  // Resolve logical size from the viewBox (or fallback to the element's bounding box).
  const viewBox = svgElement.viewBox.baseVal;
  const logicalW =
    viewBox && viewBox.width > 0 ? viewBox.width : svgElement.clientWidth || 800;
  const logicalH =
    viewBox && viewBox.height > 0 ? viewBox.height : svgElement.clientHeight || 600;

  const canvasW = Math.round(logicalW * scale);
  const canvasH = Math.round(logicalH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('exportToPng: could not obtain 2D canvas context');
  }

  // White background so transparent SVGs don't get alpha-blended black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      resolve();
    };
    img.onerror = () => reject(new Error('exportToPng: SVG image failed to load'));
    img.src = dataUrl;
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('exportToPng: canvas.toBlob returned null'));
        }
      },
      'image/png',
    );
  });
}

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

/**
 * Serialise the live SVGSVGElement to an SVG file Blob.
 */
export function exportToSvg(svgElement: SVGSVGElement): Blob {
  const serialiser = new XMLSerializer();
  const svgString = serialiser.serializeToString(svgElement);
  return new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
}

// ---------------------------------------------------------------------------
// Blob download
// ---------------------------------------------------------------------------

/**
 * Trigger a browser "Save As" download for the given Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Small timeout lets the browser start the download before the URL is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// KiCad .kicad_sch download
// ---------------------------------------------------------------------------

/**
 * Serialise the EditorState to a `.kicad_sch` string and trigger a download.
 * Uses `lib/kicad/fromEditorState.ts` which is safe to run in the browser.
 */
export async function downloadKicadSch(
  state: EditorState,
  filename = 'schematic.kicad_sch',
): Promise<void> {
  // Dynamic import keeps the KiCad serialiser out of the initial bundle for
  // pages that only consume this utility occasionally.
  const { fromEditorState } = await import('@/lib/kicad/fromEditorState');
  const source = fromEditorState(state);
  const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
}
