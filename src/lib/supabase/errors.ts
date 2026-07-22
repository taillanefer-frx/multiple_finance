export class DataRequestError extends Error {
  code: string | null

  constructor(message: string, code?: string | null) {
    super(message)
    this.name = 'DataRequestError'
    this.code = code ?? null
  }
}

export function dataErrorMessage(error: unknown, fallback: string) {
  const code = error instanceof DataRequestError ? error.code : typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''

  if (code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
    return 'Sua sessão não tem permissão para consultar estes dados.'
  }
  if (message.includes('jwt') || message.includes('session') || message.includes('token')) {
    return 'Sua sessão precisa ser renovada. Saia e entre novamente se o problema continuar.'
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('failed to fetch')) {
    return 'A conexão oscilou durante a consulta. Tente novamente.'
  }
  return fallback
}
