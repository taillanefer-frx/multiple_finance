import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/ui/BrandMark'
import { Button } from '../components/ui/Button'

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="max-w-sm text-center">
        <div className="flex justify-center"><BrandMark /></div>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[0.2em] text-petrol">Erro 404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Esta página não existe.</h1>
        <p className="mt-3 text-sm leading-6 text-muted">O endereço pode ter mudado ou o link está incompleto.</p>
        <Link to="/app"><Button className="mt-7"><ArrowLeft size={17} /> Voltar ao início</Button></Link>
      </div>
    </main>
  )
}
