export function usernameKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return usernameKey(value).length > 0 && !/[\p{Cc}\p{Cf}]/u.test(value);
}
