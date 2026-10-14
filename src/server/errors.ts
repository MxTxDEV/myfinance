/** Erro de regra de negócio com mensagem segura para exibir ao usuário. */
export class DomainError extends Error {
  constructor(message: string, public code = "DOMAIN") {
    super(message);
    this.name = "DomainError";
  }
}
