// ════════════════════════════════════════════════════════════════════
//  agent/tools.js — Herramientas que el agente Ginko puede usar
//
//  Alcance "equilibrado":
//   · Lectura / diagnóstico / invocación segura → cualquiera.
//   · Escritura, shell, git, moderación / envío en WhatsApp → SOLO owner.
//
//  Cada tool recibe `args` (objeto tipado por su schema) y `ctx`
//  { sock, m, isOwner, pushName, cwd, conn }. Devuelve un STRING (pieza de
//  texto que el modelo lee). Nunca lanza: si falla, devuelve "ERROR: ...".
// ════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getBotErrors, getBotErrorCount } from '#lib/diagnostics';

const exec = promisify(execFile);
const PROJECT_ROOT = process.cwd();
const CWD = PROJECT_ROOT;

// ── Helper: conmuta según owner ────────────────────────────────────
function requireOwner(ctx) {
  if (ctx?.isOwner) return;
  throw new Error('Esta herramienta es solo del dueño (owner) del bot.');
}

function safeResolve(rel) {
  const abs = path.resolve(CWD, String(rel || '').replace(/^\.\/+/, ''));
  const rel2 = path.relative(CWD, abs);
  if (rel2.startsWith('..')) throw new Error('Ruta fuera del proyecto: bloqueada.');
  return abs;
}

// ── Esquemas (OpenAI-compatible) ──────────────────────────────────
function fn(name, description, properties, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required },
    },
  };
}

const R = { type: 'string' };
const pathProp = { type: 'string', description: 'Ruta relativa al proyecto (ej. cmds/main/ping.js)' };

export function buildToolSchemas({ isOwner = false } = {}) {
  const all = [
    // ── Lectura (todos) ──
    fn('list_dir', 'Lista el contenido de un directorio del proyecto.', { path: pathProp }, ['path']),
    fn('find_files', 'Busca archivos por nombre (glob por substring).', { pattern: { type: 'string' }, dir: pathProp }, ['pattern']),
    fn('read_file', 'Lee un archivo del proyecto (recorta a N líneas).', { path: pathProp, maxLines: { type: 'number' } }, ['path']),
    fn('grep_code', 'Busca una cadena en los .js del proyecto (regex simple).', { pattern: { type: 'string' }, dir: pathProp }, ['pattern']),
    fn('command_lookup', 'Busca un comando del bot por nombre y devuelve sus aliases, categoría y descripción.', { query: R }, ['query']),
    // ── Diagnóstico (todos) ──
    fn('syntax_check', 'Verifica sintaxis de un .js del proyecto (node --check).', { path: pathProp }, ['path']),
    fn('read_logs', 'Devuelve los últimos errores registrados por el bot (.health).', {}, []),
    fn('health_check', 'Devuelve un resumen de salud (uptime, RAM, errores, yt-dlp/ffmpeg).', {}, []),
    // ── Memoria (todos) ──
    fn('remember_fact', 'Guarda un dato en la memoria persistente (clave → valor).', { key: R, value: R }, ['key', 'value']),
    fn('recall_memory', 'Recupera datos de memoria por clave (o todo si no se pasa).', { key: R }, []),
    fn('forget_fact', 'Borra un dato de memoria.', { key: R }, ['key']),
    // ── Owner: escritura / shell / git / acciones ──
    fn('write_file', 'ESCRIBE un archivo del proyecto. Solo owner.', { path: pathProp, content: R }, ['path', 'content']),
    fn('execute_terminal', 'EJECUTA un comando de terminal (shell) en el proyecto. Solo owner.', { command: R }, ['command']),
    fn('git_push', 'Hace git add/commit/push. Solo owner.', { message: R }, []),
    fn('run_bot_command', 'EJECUTA un comando del bot (mismo chat). Solo owner.', { command: R, args: { type: 'string' } }, ['command']),
    fn('wa_send_message', 'Envía un mensaje a un chat por el bot. Solo owner.', { jid: R, text: R }, ['jid', 'text']),
  ];
  return all.filter((t) => {
    const destructive = ['write_file', 'execute_terminal', 'git_push', 'run_bot_command', 'wa_send_message'];
    if (destructive.includes(t.function.name)) return isOwner;
    return true;
  });
}

export const TOOL_NAMES = buildToolSchemas({ isOwner: true }).map((t) => t.function.name);

// ── Ejecutor ───────────────────────────────────────────────────────
export async function executeTool(name, args = {}, ctx = {}) {
  try {
    switch (name) {
      case 'list_dir': {
        const dir = safeResolve(args.path || '.');
        const entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 60);
        return entries.map((e) => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`).join('\n') || '(vacío)';
      }
      case 'find_files': {
        const dir = safeResolve(args.dir || '.');
        const pat = String(args.pattern || '').toLowerCase();
        const out = [];
        const stack = [dir];
        while (stack.length && out.length < 40) {
          const cur = stack.pop();
          let ents;
          try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
          for (const e of ents) {
            const full = path.join(cur, e.name);
            if (e.isDirectory()) { if (!e.name.includes('node_modules')) stack.push(full); }
            else if (!pat || e.name.toLowerCase().includes(pat)) out.push(path.relative(CWD, full));
            if (out.length >= 40) break;
          }
        }
        return out.join('\n') || '(sin coincidencias)';
      }
      case 'read_file': {
        const p = safeResolve(args.path || '');
        const max = Math.max(1, Math.min(300, Number(args.maxLines) || 60));
        const text = fs.readFileSync(p, 'utf8');
        const lines = text.split('\n');
        const shown = lines.slice(0, max);
        const tail = lines.length > max ? `\n… [+${lines.length - max} líneas más]` : '';
        return shown.join('\n') + tail;
      }
      case 'grep_code': {
        const dir = safeResolve(args.dir || 'cmds');
        const pat = String(args.pattern || '');
        if (!pat) return 'ERROR: sin patrón.';
        const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const out = [];
        const stack = [dir];
        while (stack.length && out.length < 30) {
          const cur = stack.pop();
          let ents;
          try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
          for (const e of ents) {
            const full = path.join(cur, e.name);
            if (e.isDirectory()) { if (!e.name.includes('node_modules')) stack.push(full); }
            else if (/\.js$/.test(e.name)) {
              try {
                const lines = fs.readFileSync(full, 'utf8').split('\n');
                for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) {
                  out.push(`${path.relative(CWD, full)}:${i + 1}: ${lines[i].trim().slice(0, 120)}`);
                  if (out.length >= 30) break;
                }
              } catch {}
            }
            if (out.length >= 30) break;
          }
        }
        return out.join('\n') || '(sin coincidencias)';
      }
      case 'command_lookup': {
        const q = String(args.query || '').toLowerCase();
        const plugins = global.plugins || {};
        const list = Object.entries(plugins).map(([k, p]) => {
          const cmds = Array.isArray(p?.command) ? p.command : (p?.command ? [p.command] : []);
          return { key: k, cmds, category: p?.category, description: p?.description || '' };
        }).filter((c) => !q || c.cmds.some((c2) => String(c2).toLowerCase().includes(q)) || String(c.description).toLowerCase().includes(q));
        return list.slice(0, 30).map((c) => `[${c.category || '-'}] ${c.cmds.join('/')} — ${c.description}`).join('\n') || '(no encontrado)';
      }
      case 'syntax_check': {
        const p = safeResolve(args.path || '');
        try { await exec('node', ['--check', p], { timeout: 15000 }); return `✅ Sintaxis OK: ${path.relative(CWD, p)}`; }
        catch (e) { return `❌ Sintaxis ERROR en ${path.relative(CWD, p)}:\n${(e?.stderr || e?.message || '').slice(0, 600)}`; }
      }
      case 'read_logs': {
        const errs = getBotErrors(8);
        return errs.length ? errs.map((e) => `[${e.scope}] ${String(e.message).slice(0, 160)}`).join('\n') : '(sin errores registrados)';
      }
      case 'health_check': {
        const mem = process.memoryUsage();
        return [
          `uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
          `node: ${process.version}`,
          `RAM rss: ${(mem.rss / 1048576).toFixed(1)} MB · heap: ${(mem.heapUsed / 1048576).toFixed(1)} MB`,
          `errores registrados: ${getBotErrorCount()}`,
          `openai disponible: ${process.env.OPENROUTER_API_KEY ? 'sí' : 'no'}`,
        ].join('\n');
      }
      // ── Memoria ──
      case 'remember_fact': {
        const { memory } = ctx;
        if (memory) memory.setFact(String(args.key), String(args.value));
        return `Guardado: ${args.key}`;
      }
      case 'recall_memory': {
        const { memory } = ctx;
        if (!memory) return '(sin memoria)';
        return memory.getFacts(String(args.key || ''));
      }
      case 'forget_fact': {
        const { memory } = ctx;
        if (memory) memory.delFact(String(args.key));
        return `Olvidado: ${args.key}`;
      }
      // ── Owner-only ──
      case 'write_file': {
        requireOwner(ctx);
        const p = safeResolve(args.path || '');
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, String(args.content ?? ''), 'utf8');
        return `✅ Escrito ${path.relative(CWD, p)} (${String(args.content).length} chars)`;
      }
      case 'execute_terminal': {
        requireOwner(ctx);
        try {
          const { stdout } = await exec('bash', ['-c', String(args.command || '')], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
          return String(stdout).slice(0, 1500) || '(sin salida)';
        } catch (e) { return `❌ ${(e?.stderr || e?.message || '').slice(0, 600)}`; }
      }
      case 'git_push': {
        requireOwner(ctx);
        const msg = String(args.message || 'agente: actualización');
        try {
          await exec('git', ['add', '-A'], { cwd: CWD, timeout: 20000 });
          await exec('git', ['commit', '-m', msg], { cwd: CWD, timeout: 20000 });
          await exec('git', ['push', 'origin', 'HEAD'], { cwd: CWD, timeout: 30000 });
          return '✅ git add/commit/push hecho.';
        } catch (e) { return `❌ git: ${(e?.stderr || e?.message || '').slice(0, 300)}`; }
      }
      case 'run_bot_command': {
        requireOwner(ctx);
        const name = String(args.command || '').toLowerCase().replace(/^\./, '');
        const extra = String(args.args || '');
        const plugin = Object.entries(global.plugins || {}).find(([, p]) =>
          (Array.isArray(p?.command) ? p.command : [p?.command]).map(String).includes(name))?.[1];
        if (!plugin) return `❌ Comando *${name}* no encontrado.`;
        // Ejecuta el plugin en el contexto de este chat (si tiene run).
        // Devuelve un aviso (el comando ya envió su respuesta por sí mismo).
        try {
          await plugin.run({
            msg: ctx.m, sock: ctx.sock, args: (extra || '').split(/\s+/).filter(Boolean),
            usedPrefix: ctx.usedPrefix || '.', command: name, text: extra,
            isOwner: true, isAdmins: false, isBotAdmins: false,
            groupMetadata: null, participants: [],
            __dirname: global.plugins[`cmd:${name}`]?.dirname || CWD,
          });
          return `✅ Ejecutado .${name}`;
        } catch (e) { return `❌ al ejecutar .${name}: ${String(e?.message || e).slice(0, 300)}`; }
      }
      case 'wa_send_message': {
        requireOwner(ctx);
        if (!ctx.sock) return '❌ sin conexión de red para enviar.';
        await ctx.sock.sendMessage(String(args.jid || ctx.m?.chat), { text: String(args.text || '') });
        return '✅ enviado';
      }
      default:
        return `ERROR: tool desconocida ${name}`;
    }
  } catch (e) {
    return `ERROR: ${String(e?.message || e).slice(0, 400)}`;
  }
}

export { safeResolve, requireOwner, PROJECT_ROOT };
