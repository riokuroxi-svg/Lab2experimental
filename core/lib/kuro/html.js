import { kuroStyles } from "./styles.js";
import { kuroMarkup } from "./markup.js";
import { kuroEngine } from "./engine.js";

export function buildKuroHtml() {
  return `<style>${kuroStyles}</style>\n${kuroMarkup}\n<script>${kuroEngine}</script>\n`;
}
