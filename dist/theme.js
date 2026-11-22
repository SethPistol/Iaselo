// Thème clair / sombre (« mode bloc »). Chargé de façon synchrone dans <head> pour éviter un flash.
// Le choix est propre à chaque poste (localStorage) ; par défaut : thème clair.
(function () {
  var KEY = 'iaselo-theme', root = document.documentElement;
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(theme) {
    root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
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
})();
