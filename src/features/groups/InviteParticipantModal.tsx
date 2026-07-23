import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Copy, Link2, QrCode, Share2, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { generateGroupInvite } from './groupService'

interface BarcodeResult {
  rawValue: string
}

interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<BarcodeResult[]>
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance

interface InviteParticipantModalProps {
  open: boolean
  groupId: string
  userId: string
  onClose: () => void
}

export function InviteParticipantModal({ open, groupId, userId, onClose }: InviteParticipantModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimer = useRef<number | null>(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => stopScanner(), [])
  useEffect(() => {
    if (!open) stopScanner()
  }, [open])

  function stopScanner() {
    if (scanTimer.current !== null) window.clearTimeout(scanTimer.current)
    scanTimer.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setScanning(false)
  }

  async function ensureInvite() {
    if (inviteUrl) return inviteUrl
    setBusy(true)
    setError(null)
    try {
      const token = await generateGroupInvite(groupId, userId)
      const url = `${window.location.origin}/convite/${token}`
      setInviteUrl(url)
      return url
    } catch {
      setError('Não foi possível gerar o convite. Confirme se você é administrador do grupo.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    const url = await ensureInvite()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setError('Não foi possível copiar automaticamente. Toque no link e copie manualmente.')
    }
  }

  async function shareLink() {
    const url = await ensureInvite()
    if (!url) return
    if (!navigator.share) {
      await copyLink()
      setError('O compartilhamento direto não está disponível neste navegador; o link foi copiado.')
      return
    }
    try {
      await navigator.share({ title: 'Convite para o Multiple Finance', text: 'Entre no meu grupo privado.', url })
    } catch (caughtError) {
      if ((caughtError as DOMException).name !== 'AbortError') setError('Não foi possível abrir o compartilhamento do celular.')
    }
  }

  async function openQr() {
    const url = await ensureInvite()
    if (!url) return
    setBusy(true)
    setError(null)
    try {
      const moduleUrl = 'https://esm.sh/qrcode@1.5.4?bundle'
      const qrModule = await import(/* @vite-ignore */ moduleUrl) as { toDataURL: (value: string, options: Record<string, unknown>) => Promise<string> }
      setQrDataUrl(await qrModule.toDataURL(url, { width: 420, margin: 2, errorCorrectionLevel: 'M' }))
      setShowQr(true)
    } catch {
      setError('Não foi possível gerar o QR Code agora. O link de convite continua disponível para copiar ou compartilhar.')
    } finally {
      setBusy(false)
    }
  }

  async function startScanner() {
    setError(null)
    const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
    if (!Detector) {
      setError('A leitura de QR Code não é compatível com este navegador. Abra o link de convite diretamente.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      setScanning(true)
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      const detector = new Detector({ formats: ['qr_code'] })
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return
        try {
          const results = await detector.detect(videoRef.current)
          const rawValue = results[0]?.rawValue
          if (rawValue) {
            const url = new URL(rawValue, window.location.origin)
            const match = url.pathname.match(/^\/convite\/([0-9a-f-]+)$/i)
            if (!match) throw new Error('Invalid invite QR')
            stopScanner()
            window.location.assign(`/convite/${match[1]}`)
            return
          }
        } catch (caughtError) {
          if ((caughtError as Error).message === 'Invalid invite QR') {
            setError('Este QR Code não contém um convite válido do Multiple Finance.')
            stopScanner()
            return
          }
        }
        scanTimer.current = window.setTimeout(() => void scan(), 350)
      }
      void scan()
    } catch (caughtError) {
      stopScanner()
      setError((caughtError as DOMException).name === 'NotAllowedError'
        ? 'Permissão da câmera negada. Autorize a câmera no navegador e tente novamente.'
        : 'Não foi possível iniciar a câmera.')
    }
  }

  return (
    <Modal open={open} onClose={() => { stopScanner(); onClose() }} title="+ Participante" description="O convite só libera a entrada após login e confirmação da própria pessoa.">
      <div className="space-y-4">
        {!inviteUrl ? <Button fullWidth disabled={busy} onClick={() => void ensureInvite()}><Link2 size={17} /> {busy ? 'Gerando…' : 'Gerar convite privado'}</Button> : <input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} className="field text-xs" aria-label="Link de convite" />}
        <div className="grid grid-cols-2 gap-2"><Button variant="secondary" disabled={busy} onClick={() => void copyLink()}>{copied ? <CheckCircle2 size={16} /> : <Copy size={16} />} {copied ? 'Copiado' : 'Copiar link'}</Button><Button variant="secondary" disabled={busy} onClick={() => void shareLink()}><Share2 size={16} /> Compartilhar</Button><Button variant="secondary" disabled={busy} onClick={() => void openQr()}><QrCode size={16} /> Exibir QR</Button><Button variant="secondary" disabled={busy || scanning} onClick={() => void startScanner()}><Camera size={16} /> Ler QR</Button></div>
        {showQr && inviteUrl && qrDataUrl && <div className="rounded-3xl bg-canvas p-5 text-center"><img src={qrDataUrl} alt="QR Code do convite privado" className="mx-auto h-auto w-full max-w-[13rem] rounded-xl" /><p className="mt-3 text-xs leading-5 text-muted">O QR Code é gerado no navegador e representa exatamente o mesmo link privado.</p></div>}
        {scanning && <div className="relative overflow-hidden rounded-3xl bg-ink"><video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" /><button type="button" onClick={stopScanner} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white text-ink" aria-label="Cancelar leitura"><X size={18} /></button><p className="absolute inset-x-4 bottom-4 rounded-2xl bg-ink/70 px-3 py-2 text-center text-xs text-white">Aponte a câmera para o QR Code do convite.</p></div>}
        {error && <p className="rounded-2xl bg-red-50 p-3 text-xs leading-5 text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
