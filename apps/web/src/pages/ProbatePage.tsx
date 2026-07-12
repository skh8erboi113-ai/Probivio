import { useState } from 'react';

import { Card } from '../components/ui/Card';
import { useToast } from '../context/ToastContext';
import { probateApi } from '../api/probate.api';
import { fonts, palette, spacing } from '../theme';

export function ProbatePage() {
  const { notify } = useToast();
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const result = await probateApi.scan({ type: 'base64', filename: file.name, data: base64 });
      notify('success', `Extracted case ${result.data.caseNumber}`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div>
        <div style={{ fontSize: 11, color: palette.accent, fontFamily: fonts.mono, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
          Discovery
        </div>
        <h1 style={{ fontFamily: fonts.display, fontSize: 32, margin: `${spacing.xs}px 0 0` }}>
          Probate Scanner
        </h1>
      </div>

      <Card accent="purple">
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <p style={{ color: palette.textMuted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            Upload a probate court filing PDF. Gemini AI will extract case number, decedent, executors, and estate assets.
          </p>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: spacing.lg,
              border: `2px dashed ${palette.border}`,
              borderRadius: 12,
              cursor: 'pointer',
              color: palette.textMuted,
              fontFamily: fonts.mono,
              fontSize: 13,
            }}
          >
            {uploading ? 'Scanning…' : 'Click to select PDF'}
            <input type="file" accept="application/pdf" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>
      </Card>
    </div>
  );
}
