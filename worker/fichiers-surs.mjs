// IASELO · pièces jointes servies sans risque (audit de sécurité du 27/11/2026).
// Audit du 27/11 : le type d'une pièce jointe vient du poste qui l'a déposée. Un type exécutable par le navigateur
// (HTML, SVG, XML, JavaScript) est servi comme fichier brut, et toute pièce (sauf PDF, que la visionneuse du navigateur
// isole déjà et qu'elle refuse d'afficher dans un bac à sable) est servie dans un bac à sable sans script.
export const FICHIER_CSP="sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";
export const typeSur=t=>{const v=String(t||'').toLowerCase().split(';')[0].trim();return !v||/html|svg|script|\/xml$|\+xml$/.test(v)||!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(v)?'application/octet-stream':v};
export const enTetesFichier=type=>type==='application/pdf'?{}:{'Content-Security-Policy':FICHIER_CSP};
