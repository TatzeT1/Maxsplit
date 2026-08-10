export class AmountMismatchError extends Error {
  constructor(what: string, expected: number, actual: number) {
    super(`${what}: expected ${expected} but got ${actual}`);
    this.name = "AmountMismatchError";
  }
}
