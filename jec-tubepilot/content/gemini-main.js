// JEC TubePilot — gemini.google.com (monde de la page) : quand TubePilot joint l'audio, le sélecteur de fichiers
// ouvert par le bouton « Importer » de Gemini reçoit directement ce fichier (une seule fois, pendant 15 s).
(function () {
  'use strict';
  if (window.__tpGwMain) return;
  window.__tpGwMain = true;
  let armed = null;

  function useArmed(input) {
    if (!armed || Date.now() > armed.until || input.type !== 'file') return false;
    const dt = new DataTransfer();
    dt.items.add(armed.file);
    armed = null;
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  const click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (useArmed(this)) return undefined;
    return click.apply(this, arguments);
  };
  const showPicker = HTMLInputElement.prototype.showPicker;
  if (showPicker) {
    HTMLInputElement.prototype.showPicker = function () {
      if (useArmed(this)) return undefined;
      return showPicker.apply(this, arguments);
    };
  }

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.tp === 'tp-gw-arm' && e.data.file instanceof File) armed = { file: e.data.file, until: Date.now() + 15000 };
  });
})();
