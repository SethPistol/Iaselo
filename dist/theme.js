// Thème clair / sombre (« mode bloc »). Chargé de façon synchrone dans <head> pour éviter un flash.
// Le choix est propre à chaque poste (localStorage) ; par défaut : thème clair.
(function () {
  var KEY = 'iaselo-theme', root = document.documentElement;
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  // L'aide scientifique est un cadre isolé : son thème suit celui de la page par l'ancre de l'URL.
  function syncFrames() {
    var frames = document.querySelectorAll('iframe[src^="scientifique-v022.html"]');
    for (var i = 0; i < frames.length; i++) {
      var src = frames[i].getAttribute('src') || '', next = src.replace(/([#&])theme=(light|dark)/, '$1theme=' + root.dataset.theme);
      if (next === src && src.indexOf('#') !== -1 && !/[#&]theme=/.test(src)) next = src + '&theme=' + root.dataset.theme;
      if (next !== src) frames[i].setAttribute('src', next);
    }
  }
  function apply(theme) {
    root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    syncFrames();
    var button = document.getElementById('theme-toggle');
    if (button) {
      var dark = root.dataset.theme === 'dark';
      button.setAttribute('aria-pressed', String(dark));
      var label = button.querySelector('span');
      if (label) label.textContent = dark ? 'Mode clair' : 'Mode sombre';
    }
  }
  apply(read());
  document.addEventListener('DOMContentLoaded', function () {
    apply(root.dataset.theme);
    var button = document.getElementById('theme-toggle');
    if (button) button.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
    });
  });
  // Impression : toujours en thème clair, quel que soit le thème à l'écran.
  var printed = null;
  window.addEventListener('beforeprint', function () { printed = root.dataset.theme; root.dataset.theme = 'light'; });
  window.addEventListener('afterprint', function () { if (printed) root.dataset.theme = printed; printed = null; });
})();
