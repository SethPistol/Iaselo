(() => {
  const header = document.querySelector('main > header');
  if (!header || document.body.dataset.patientPage) return;

  const meta = document.createElement('div');
  const date = document.createElement('span');
  meta.className = 'art-header-meta';
  date.textContent = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  }).format(new Date());
  meta.append(date);
  header.append(meta);
})();
