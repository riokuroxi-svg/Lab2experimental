# Lab2experimental — Workflow

Rol de este repositorio: **LABORATORIO ACTIVO / EXPERIMENTAL**.


Este documento define cómo trabajar en los repositorios de Ginko para evitar arrastrar experimentos rotos al bot estable.

## Roles de repositorios

| Repo | Rol | Uso correcto |
|---|---|---|
| `Ginko-MD` | Estable | Uso diario. Solo recibe cambios pequeños, probados y aprobados. |
| `Ginko-MD-Lab` | Laboratorio intermedio | Validación pre-estable; sirve para filtrar antes de tocar estable. |
| `Lab2experimental` | Laboratorio activo | Experimentos, mediciones, pruebas fuertes y descartes. |

## Reglas obligatorias

1. No hacer sync completo entre repositorios.
2. Migrar solo archivos/cambios útiles y probados.
3. Crear checkpoint antes de tocar `Ginko-MD` o cambios delicados.
4. No subir tokens, sesiones, bases de datos privadas, `node_modules` ni caches.
5. No usar `npm audit fix --force` sin revisar impacto.
6. No dejar logs temporales, comandos demo ni código muerto en estable.
7. Si una idea falla, se documenta y se elimina o se deja aislada en laboratorio.
8. Antes de push: `git status`, checks de sintaxis/pruebas disponibles y verificación del remoto.

## Flujo de migración correcto

```txt
Lab2experimental → prueba real → auditoría → Ginko-MD-Lab opcional → Ginko-MD
```

## Criterios para pasar a estable

Un cambio puede pasar a `Ginko-MD` solo si cumple:

- Tiene objetivo claro.
- Fue probado en laboratorio o por simulación razonable.
- No introduce comandos experimentales innecesarios.
- No rompe comportamiento existente.
- No arrastra archivos de diagnóstico.
- Se puede revertir con checkpoint o commit claro.

## Cosas que NO deben migrar a estable

- Comandos de prueba sin valor para usuarios.
- Logs temporales.
- Demos visuales no aprobadas.
- Cambios masivos no revisados.
- Dependencias nuevas sin necesidad clara.
- Código que “debería funcionar” pero no fue probado.

## Seguridad

Si se usa un token de GitHub, debe ser temporal y nunca guardarse en `.git/config`, `.env`, README, docs o código.
