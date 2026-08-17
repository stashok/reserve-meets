export function isVivaldi(): boolean {
  const ua = globalThis.navigator?.userAgent ?? "";
  return /\bVivaldi\b/i.test(ua);
}
