import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from '../components/ui/StateDisplay'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Ponto preparado para observabilidade sem expor dados do usuário.
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-canvas p-5">
          <div className="w-full max-w-md">
            <ErrorState title="A tela encontrou um estado inesperado" description="Você pode tentar novamente sem recarregar o navegador. Se mudar de tela, este estado será descartado." onRetry={() => this.setState({ hasError: false })} />
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
