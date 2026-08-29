# Bloque C — Disciplina de repos · Estado en Lab2

## Punto 8 — Formalizar regla de repos ✅ (ya existía)

- `Ginko-MD` (estable) solo recibe cambios **probados**.
- `Lab2experimental` es el campo de pruebas; los experimentos se quedan aquí.
- Documentado en `docs/GINKO-WORKFLOW.md` y `docs/GINKO-BLOCKS.md`. **No requería trabajo.**

## Punto 9 — Auditoría de dependencias ✅ (este cambio)

**Resultado de `npm audit`:** 2 vulnerabilidades **High**, ambas del mismo paquete
transitivo:

- `baileys` (pinneado) → `link-preview-js` **3.2.0** → **CVE-2026-43897**
  (SSRF por IP/loopback IPv4+IPv6 y DNS a IP interna). Sin fix por npm.

**Cómo se trató (sin `npm audit fix --force`):**
- **Mitigado** con `assertSafeUrl()` en `core/lib/rich-ui.js`: valida el host antes
  de llamar a `getUrlInfo` (la API que usa link-preview-js), rechazando IPs
  privadas/loopback (v4/v6) y DNS que resuelva a IP interna. Verificado 18/18.
- El bot ya tenía `generateHighQualityLinkPreview: false`, así que no hace
  previews automáticos → el riesgo era bajo; ahora está mitigado y documentado.

**Además se fijaron 4 dependencias `latest` → exactas** para que `npm install`
sea reproducible:
- `@vitalets/google-translate-api` → `9.2.1`
- `jimp` → `1.6.1`
- `lodash` → `4.18.1`
- `node-cache` → `5.1.2`

**Archivos tocados:**
- `core/lib/rich-ui.js` → validación SSRF (aditiva).
- `package.json` → versiones fijadas (sin `latest`).
- `docs/LAB2-DEPS-AUDIT.md` → informe completo.
- `docs/GINKO-BLOCKS.md` → punto 9 marcado.

## Verificación
- `package.json` válido, sin `"latest"`.
- `npm install --dry-run` sin errores.
- `node --check` de `rich-ui.js` OK.
- 18/18 asserts de la validación SSRF.

## Pendiente
- Punto 9 **listo** para tu visto bueno en Termux (no cambia comportamiento del
  bot; solo congela versiones y sume una validación de seguridad).
