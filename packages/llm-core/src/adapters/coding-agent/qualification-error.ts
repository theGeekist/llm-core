export class CodingAgentQualificationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CodingAgentQualificationError";
  }
}
