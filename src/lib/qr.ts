export type QrRes = { ok: boolean; qr: string; msg?: string };

/**
 * A failed QR fetch must never wipe a working code off the screen: W-API's
 * qr-code endpoint answers "Instância não encontrada" at random, and losing the
 * code mid-scan is what stops users from pairing.
 */
export function keepQr(prev: string, res: QrRes | undefined): string {
  return res?.ok && res.qr ? res.qr : prev;
}
