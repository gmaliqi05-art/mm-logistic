export function triggerPrint(): void {
  if (typeof window === 'undefined') return;
  setTimeout(() => window.print(), 50);
}
