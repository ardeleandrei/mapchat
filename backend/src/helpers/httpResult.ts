export function httpResult<T>(status: number, body: T) { return { status, body }; }
