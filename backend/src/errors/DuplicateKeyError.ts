// Persistence adapters translate database-specific duplicate errors to this type.
export class DuplicateKeyError extends Error {
  constructor() { super("A record with this request key already exists"); }
}
