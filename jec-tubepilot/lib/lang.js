// TubePilot — chargement des traductions pour les modules (pages de l'extension, service worker)
import './locales/en.js';
import './locales/fr.js';
import './locales/ar.js';
import './i18n.js';

export const I18n = globalThis.TPI18n;
export const t = (key, vars) => globalThis.TPI18n.t(key, vars);
