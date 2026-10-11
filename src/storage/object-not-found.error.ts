export class ObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`object ${key} does not exist`);
    this.name = ObjectNotFoundError.name;
  }
}
