// Génère dist/iaselo-couleurs.css : recoloration des feuilles de style historiques
// vers la palette « Scialytique » (thème clair) et le mode sombre.
//
// Les feuilles historiques contiennent plusieurs centaines de couleurs codées en dur.
// Plutôt que de les réécrire à la main, ce script relit chaque règle qui porte une
// couleur et la redéclare avec la couleur correspondante de la nouvelle palette :
// - les gris, crèmes et beiges deviennent des gris froids de même luminosité ;
// - les bleus, sarcelles et ors décoratifs prennent la teinte bleu pétrole du logo ;
// - rouge, orange et vert restent réservés aux statuts cliniques.
// La luminosité est conservée en clair, si bien que les contrastes d'origine le sont aussi.
// En sombre, la luminosité est inversée (surfaces sombres, texte clair).
//
// Usage : node scripts/theme-generate.mjs   (à relancer après modification d'une feuille listée)
import fs from 'node:fs';

const SOURCES = ['parcours-v8.css', 'parcours-v9.css', 'atelier.css', 'trocadero.css', 'questionnaire.css',
  'patient-invitation.css', 'service.css', 'gestion.css', 'nursing-record.css', 'identitovigilance.css',
  'dossier-partage.css', 'acces-professionnels.css'];
const COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
}
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
function hslToHex(h, s, l, a = 1) {
  const f = n => { const k = (n + h / 30) % 12, c = s * Math.min(l, 1 - l); return Math.round(255 * (l - c * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  const hex = '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
  return a < 1 ? hex + Math.round(a * 255).toString(16).padStart(2, '0') : hex;
}

// Famille de chaque couleur d'origine.
function family({ h, s, l }) {
  if (s < 0.14 || l > 0.965 || l < 0.06) return 'neutre';
  if (l > 0.8 && s < 0.5 && !(h < 14 || h >= 335)) return 'neutre';  // bordures et fonds pâles
  if ((h < 14 || h >= 335) && s > 0.35) return 'critique';
  if (h >= 14 && h < 50) {
    if (s > 0.62 && l > 0.3 && l < 0.7) return 'vigilance';  // orange vif : statut
    if (s < 0.45 && l > 0.78) return 'neutre';               // crèmes et beiges
    return 'marque';                                          // ors et bruns décoratifs
  }
  if (h >= 50 && h < 68) return 'vigilance';
  if (h >= 68 && h < 168) return 'stable';
  return 'marque';
}
const HUE = { neutre: 212, marque: 192, critique: 356, vigilance: 32, stable: 158 };
const SAT = { neutre: 0.16, marque: 0.62, critique: 0.68, vigilance: 0.9, stable: 0.62 };

function light(c) {
  const hsl = rgbToHsl(c), fam = family(hsl);
  let s = SAT[fam];
  if (fam === 'neutre') s = hsl.l > 0.9 ? 0.22 : 0.16;
  if (fam !== 'neutre' && hsl.l > 0.88) s = Math.min(s, 0.55);
  return hslToHex(HUE[fam], s, hsl.l, c.a);
}
function dark(c) {
  const hsl = rgbToHsl(c), fam = family(hsl);
  let l;
  if (fam === 'neutre') l = hsl.l >= 0.985 ? 0.125 : 0.06 + (1 - hsl.l) * 0.88;
  else l = hsl.l > 0.8 ? 0.11 + (1 - hsl.l) * 0.7 : Math.min(0.84, Math.max(0.62, 1 - hsl.l * 0.55));
  let s = fam === 'neutre' ? 0.18 : fam === 'marque' ? 0.5 : 0.7;
  if (fam !== 'neutre' && l < 0.3) s = Math.min(s, 0.35);
  return hslToHex(HUE[fam], s, l, c.a);
}

// Découpe minimale d'une feuille CSS en règles, @media compris.
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let i = 0;
  function block(media) {
    while (i < css.length) {
      const open = css.indexOf('{', i), close = css.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) { i = close + 1; return; }
      if (open === -1) { i = css.length; return; }
      const head = css.slice(i, open).trim(); i = open + 1;
      if (head.startsWith('@media') || head.startsWith('@supports')) { block(head); continue; }
      if (head.startsWith('@')) { let depth = 1; while (depth && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; } continue; }
      const end = css.indexOf('}', i); const body = css.slice(i, end); i = end + 1;
      out.push({ media, selector: head, body });
    }
  }
  block(null);
  return out;
}

// Le sélecteur sombre est enveloppé dans :where() pour garder la spécificité d'origine :
// iaselo.css, chargée après, peut ainsi reprendre la main sur les deux thèmes.
function darkSelector(selector) {
  return selector.split(',').map(s => {
    s = s.trim();
    if (s.startsWith(':root')) return ':root:where([data-theme=dark])' + s.slice(5);
    if (s.startsWith('html')) return 'html:where([data-theme=dark])' + s.slice(4);
    return ':where(:root[data-theme=dark]) ' + s;
  }).join(',');
}

const lightRules = [], darkRules = [];
for (const file of SOURCES) {
  for (const rule of parse(fs.readFileSync('dist/' + file, 'utf8'))) {
    if (rule.media && /print/.test(rule.media) && !/screen/.test(rule.media)) continue;
    const decls = rule.body.split(';').map(d => d.trim()).filter(d => d.includes(':') && COLOR.test(d));
    COLOR.lastIndex = 0;
    if (!decls.length) continue;
    const map = fn => decls.map(d => d.replace(COLOR, m => fn(hexToRgb(m)))).join(';');
    const wrap = (sel, body) => rule.media ? `${rule.media}{${sel}{${body}}}` : `${sel}{${body}}`;
    lightRules.push(wrap(rule.selector, map(light)));
    darkRules.push(wrap(darkSelector(rule.selector), map(dark)));
  }
}
const header = '/* Fichier généré par scripts/theme-generate.mjs : ne pas modifier à la main. */\n';
fs.writeFileSync('dist/iaselo-couleurs.css', header + '/* Thème clair */\n' + lightRules.join('\n') + '\n/* Mode sombre */\n' + darkRules.join('\n') + '\n');
console.log(`iaselo-couleurs.css : ${lightRules.length} règles recolorées par thème.`);
