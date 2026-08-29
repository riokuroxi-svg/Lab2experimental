# 📦 Auditoría de dependencias — bloque (Lab2)

**Fecha:** 2026-08-28
**Rama:** `main` + cambios del Bloque C
**Comando:** `npm install` + `npm audit` (sin `--force` a ciegas).

---

## 1. Resultado de `npm audit`

```
2 high severity vulnerabilities
```

Ambas provienen del **mismo paquete transitivo**:

| Paquete | Versión | Severidad | CVE | Fix |
|---|---|---|---|---|
| `link-preview-js` | 3.2.0 | Alta | **CVE-2026-43897** | No hay fix por npm |

**Ruta:** `baileys` (WaSocket, pinneado en `41ce958...`) → `link-preview-js` ^3.0.0.

- **Vulnerabilidad:** `link-preview-js` ≤4.0.0 no bloquea peticiones a **IPs
  privadas/loopback** (IPv4 e IPv6) ni **DNS que resuelva a IPs internas**
  (SSRF / fuga de datos internos). Se soluciona en **4.0.1**, pero baileys lo
  tiene pinneado a ^3.0.0.
- **NO se usó `npm audit fix --force`** porque forzaría una versión de
  link-preview-js/baileys que **rompería** el bot (va contra la regla del repo).
- **Mitigación aplicada:** en `core/lib/rich-ui.js` añadimos `assertSafeUrl()`
  que **valida el host antes** de llamar a `getUrlInfo` (la API de baileys que
  usa `link-preview-js`): rechaza IPs privadas/loopback (IPv4 + IPv6) y dominios
  cuyo DNS resuelva a IP interna. Así el bot no puede usarse como puerta a la red
  interna. Verificado con **18/18 asserts**.

> Conclusión: la vulnerabilidad **no está explotada** en el uso normal (el bot ya
> tenía `generateHighQualityLinkPreview: false`, así que no hace previews
> automáticos), y ahora **está mitigada** con validación de host. Se documenta
> para seguimiento, pero **no bloquea** el bloque.

---

## 2. Dependencias sin control de versión (`latest`)

Había **4** en `latest`, lo que hacía el `npm install` irreproducible (podía bajar
versiones distintas cada vez). Se fijaron a la versión actual **exacta** (ya probada):

| Paquete | Antes | Ahora |
|---|---|---|
| `@vitalets/google-translate-api` | `latest` | `9.2.1` |
| `jimp` | `latest` | `1.6.1` |
| `lodash` | `latest` | `4.18.1` |
| `node-cache` | `latest` | `5.1.2` |

> Todas existían en el registry (verificado con `npm view`) y son exactamente las
> que ya estaban instaladas → **no cambia el comportamiento**, solo congela lo que
> funciona y hace el instalador predecible.

---

## 3. Dependencias de Git / alias

| Paquete | Valor | Nota |
|---|---|---|
| `baileys` | `github:this-xys/WaSocket#41ce958...` | ✅ Pinneada a commit exacto (no cambia). |
| `aptoide-scraper` | `github:DIEGO-OFC/dv-aptoide-scraper` | Git sin pin. Se deja (es una depende de nicho); iría a 1.0.1. OK. |
| `cheerio` | `npm:cheerio@1.0.0-rc.12` | Alias a versión concreta. OK. |

---

## 4. Verificación

- `package.json` → **JSON válido**, sin ningún `"latest"`.
- `npm install --dry-run` → **sin errores** (23 paquetes: sesión rápida).
- `node --check` de `rich-ui.js` → OK.
- `npm audit` → solo el CVE de link-preview-js (mitigado + documentado).

---

## Resumen / decisión

- ✅ **No** se usó `npm audit fix --force`.
- ✅ Se **mitigó** el CVE de `link-preview-js` (validación SSRF en rich-ui.js).
- ✅ Se **fijaron** 4 dependencias `latest` → exactas (reproducibilidad).
- ✅ Se documenta el CVE residual (depende de baileys pinneado; no bloquea).

> Todo en Lab2, con checkpoint. **No pasa a Ginko-MD** hasta tu visto bueno en Termux.
