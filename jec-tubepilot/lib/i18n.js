// TubePilot — traductions de l'interface (anglais, français, arabe). Langue : réglage « uiLang », sinon celle du navigateur.
(function (g) {
  'use strict';
  const L = g.TP_LOCALES || (g.TP_LOCALES = {});
  const NAMES = { en: 'English', fr: 'Français', ar: 'العربية' };
  let cur = null;

  function detect() {
    const n = String(g.navigator?.language || 'en').slice(0, 2).toLowerCase();
    return L[n] ? n : 'en';
  }
  const lang = () => cur || detect();
  function setLang(l) {
    cur = l && l !== 'auto' && L[l] ? l : detect();
    return cur;
  }
  // t('clé', { n: 3 }) → texte traduit ; repli sur l'anglais, puis sur la clé
  function t(key, vars) {
    const s = L[lang()]?.[key] ?? L.en?.[key] ?? key;
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s;
  }
  async function init() {
    try { const { settings } = await chrome.storage.local.get('settings'); setLang(settings?.uiLang || 'auto'); } catch (e) { setLang('auto'); }
    return cur;
  }
  const dir = () => (lang() === 'ar' ? 'rtl' : 'ltr');
  // nom de la langue de l'interface, en anglais (pour les consignes envoyées à Gemini)
  const englishName = (l = lang()) => ({ en: 'English', fr: 'French', ar: 'Arabic' }[l] || 'English');
  // nombres et dates au format de la langue
  const locale = () => ({ en: 'en-US', fr: 'fr-FR', ar: 'ar-u-nu-latn' }[lang()] || 'en-US');

  // traduit les éléments marqués data-i18n (texte), data-i18n-ph (placeholder), data-i18n-title (infobulle)
  function apply(root = g.document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    if (root === g.document && root.documentElement) { root.documentElement.lang = lang(); root.documentElement.dir = dir(); }
  }

  g.TPI18n = { t, lang, setLang, init, dir, apply, englishName, locale, NAMES, available: () => Object.keys(L) };
})(globalThis);
