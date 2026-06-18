/**
 * @author Junaid Atari <mj.atari@gmail.com>
 * @copyright 2025 Junaid Atari
 * @see https://github.com/blacksmoke26
 */

/**
 * PdfViewerModal — Full-screen modal that previews the uploaded PDF using an iframe.
 * Appears after file upload but before any OCR / extract action.
 * Uses native browser PDF rendering (no external library needed).
 */

import { useState, useEffect } from 'react';
import { ExternalLink, X, Eye } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogTitle } from '#/components/ui/Dialog';

interface PdfViewerModalProps {
  file: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dark: boolean;
}

export function PdfViewerModal({ file, open, onOpenChange, dark }: PdfViewerModalProps) {
  const [blobUrl, setBlobUrl] = useState<string>('');

  // Create blob URL when file and open change
  useEffect(() => {
    if (file && open) {
      const url = URL.createObjectURL(file);
      setBlobUrl(url); // eslint-disable-line react-hooks/exhaustive-deps
      return () => URL.revokeObjectURL(url);
    }
    setBlobUrl('');
  }, [file, open]);

  const handleClose = () => {
    setBlobUrl('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="full" position="center" showCloseButton={false} closeOnInteractOutside={false} className="p-0">

        {/* DialogTitle for screen-reader accessibility */}
        <DialogTitle className="sr-only">PDF Viewer — {file?.name ?? 'Untitled'}</DialogTitle>

        <div className={`flex flex-col h-full ${dark ? 'bg-[#1a1b26]' : 'bg-white'}`}>
          {/* ── Toolbar ─────────────────────────────── */}
          <div className={`flex items-center justify-between px-4 py-2 border-b ${dark ? 'border-white/10 bg-[#1a1b26]' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Eye className={`h-4 w-4 shrink-0 ${dark ? 'text-violet-400' : 'text-violet-500'}`} />
              <span className={`text-sm font-medium truncate ${dark ? 'text-slate-300' : 'text-gray-900'}`}>{file?.name ?? 'PDF Viewer'}</span>
            </div>

            <div className="flex items-center gap-2 ml-4">
              {/* Download link */}
              {blobUrl && (
                <a
                  href={blobUrl}
                  download={file?.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-gray-200 text-gray-600'}`}
                  aria-label="Download original file"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}

              {/* Close button */}
              <button
                onClick={handleClose}
                className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-gray-200 text-gray-600'}`}
                aria-label="Close viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── PDF Content ─────────────────────────── */}
          {/* Use a key to force remount when file changes */}
          <DialogBody key={blobUrl || 'empty'} className={`flex-1 overflow-hidden ${dark ? 'bg-black' : 'bg-gray-100'}`}>
            {blobUrl ? (
              <iframe
                src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                className={`w-full h-full border-0 ${dark ? 'filter invert brightness-[1.08] contrast-[1.05]' : ''}`}
                title="PDF Viewer"
              />
            ) : (
              <div className={`flex items-center justify-center h-full ${dark ? 'text-slate-600' : 'text-gray-400'}`}>
                <span className="text-sm">Loading PDF…</span>
              </div>
            )}
          </DialogBody>
        </div>
      </DialogContent>
    </Dialog>
  );
}
