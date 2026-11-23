import { useState } from 'react'
import { Download, Headphones } from 'lucide-react'
import { apiCall, formatBytes, mediaKind } from './lib'
import type { DownloadFile } from './lib'

export function MediaPlayer({ url, mime, filename, title }: { url: string; mime?: string; filename?: string; title?: string }) {
  const k = mediaKind(mime, filename)
  if (k === 'video') return <video controls preload="metadata" playsInline src={url} style={{ width: '100%', maxHeight: 360, borderRadius: 12, background: '#141A3C' }} />
  if (k === 'image') return <img src={url} alt={title || ''} loading="lazy" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 12 }} />
  if (k === 'document') return <a className="text-link" href={url} target="_blank" rel="noreferrer">Open PDF</a>
  return <audio controls preload="none" src={url} />
}

export function OwnedFiles({ productId, setToast }: { productId: string; setToast: (m: string) => void }) {
  const [files, setFiles] = useState<DownloadFile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    setBusy(true)
    const r = await apiCall<{ files?: DownloadFile[]; error?: string }>('/api/download', { auth: true, body: { productId, mode: 'download' } })
    setBusy(false)
    if (!r.ok || !r.data.files) return setToast(r.data.error || 'Could not get your files.')
    setFiles(r.data.files)
  }
  return <div className="files-panel">
    <span className="tiny-label">Your files</span>
    <h3>Watch, listen and download</h3>
    {files === null
      ? <button className="btn btn-accent" disabled={busy} onClick={load}><Headphones size={17} /> {busy ? 'Preparing...' : 'Get my files'}</button>
      : files.length === 0 ? <p className="field-help">The artist has not added files to this release yet.</p>
      : <><ul className="file-list">{files.map(f => <li key={f.id}><div><b>{f.title}</b><span>{formatBytes(f.sizeBytes)}</span></div><MediaPlayer url={f.url} mime={f.mime} filename={f.filename} title={f.title} /><a className="text-link" href={f.url} download={f.filename}><Download size={14} /> Download</a></li>)}</ul>
        <p className="field-help">These links expire after 10 minutes for your security. <button className="text-link" onClick={load}>Refresh links</button></p></>}
  </div>
}
