export const PAIRING_CODE_TTL_SECONDS = 60;

export function buildPairingCodeMessage(code, validitySeconds = PAIRING_CODE_TTL_SECONDS) {
  const codeText = String(code || '').trim();
  return `*Sub-Bot — Code*

*Instrucciones*
0) Si te llega una notificación de vinculación, tócala y salta al paso 5.
1) Abre WhatsApp y toca los *3 puntos* o *Configuración*.
2) Entra a *Dispositivos vinculados*.
3) Toca *Vincular un dispositivo*.
4) Elige *Vincular con número de teléfono*.
5) Pega el código de abajo.

━━━━━━━━━━━━━━━━━━━━

*${codeText}*

⏱️ Válido por *${validitySeconds} segundos*.
> Este código solo funciona para el número que lo solicitó.`;
}
