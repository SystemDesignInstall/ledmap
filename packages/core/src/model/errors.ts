export class DomainError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'DomainError'
    this.code = code
  }
}