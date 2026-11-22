(function () {
  'use strict';

  const origin = 'https://base-donnees-publique.medicaments.gouv.fr';
  const posologyAnchor = '#4.2._Posologie_et_mode_d_administration';
  const fold = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[µμ]/g, 'u').replace(/[^a-z0-9]+/g, ' ').trim();
  let catalogueRequest;

  function loadCatalogue() {
    catalogueRequest ??= fetch('assets/medicaments-bdpm.json?v=2026-01-08')
      .then(response => {
        if (!response.ok) throw new Error('Catalogue indisponible');
        return response.json();
      })
      .then(data => {
        const specialties = data.specialties.map(([cis, name, form, routes, authorization, market, substances]) => ({
          cis, name, form, routes, authorization, market, substances,
          label: fold(name),
          searchable: fold([cis, name, ...substances].join(' ')),
          active: authorization === 'Autorisation active' && market === 'Commercialisée'
        }));
        return { ...data, specialties, byCode: new Map(specialties.map(drug => [drug.cis, drug])) };
      })
      .catch(error => {
        catalogueRequest = undefined;
        throw error;
      });
    return catalogueRequest;
  }

  function search(specialties, query, includeHistorical) {
    const words = query.split(' ');
    return specialties.filter(drug =>
      (includeHistorical || drug.active) && words.every(word => drug.searchable.includes(word))
    ).sort((a, b) =>
      Number(b.active) - Number(a.active) ||
      Number(b.cis === query) - Number(a.cis === query) ||
      Number(b.label.startsWith(query)) - Number(a.label.startsWith(query))
    );
  }

  function mount(form, references, escape) {
    const panel = form.querySelector('[data-bdpm]');
    if (!panel) return;
    const query = panel.querySelector('input[type="search"]');
    const historical = panel.querySelector('input[type="checkbox"]');
    const status = panel.querySelector('[role="status"]');
    const results = panel.querySelector('[data-bdpm-results]');
    const details = panel.querySelector('[data-bdpm-details]');
    const drugName = form.elements.namedItem('drug');
    const drugCode = form.elements.namedItem('drugCis');
    let requestId = 0;
    let timer;

    function showDrug(drug) {
      const rcp = origin + '/medicament/' + drug.cis + '/extrait' + posologyAnchor;
      const doses = references[drug.cis] ?? [];
      drugName.value = drug.name;
      drugCode.value = drug.cis;
      form.dataset.dirty = 'true';
      details.innerHTML = `<div class="bdpm-drug">
        <h4>${escape(drug.name)}</h4>
        <p>${escape(drug.substances.join(' + ') || drug.form)} · CIS ${drug.cis}</p>
        <p>Voies BDPM · ${escape(drug.routes.split(';').filter(Boolean).join(', ') || 'Non renseignées')}</p>
        ${drug.active ? '' : `<p><strong>${escape(drug.authorization)} · ${escape(drug.market)}</strong></p>`}
        ${doses.length ? `<h5>Repères adultes du RCP par indication</h5><dl>${doses.map(([label, dose]) =>
          `<dt>${escape(label)}</dt><dd>${escape(dose)}</dd>`).join('')}</dl>` : ''}
        <a href="${rcp}" target="_blank" rel="noopener noreferrer">Ouvrir le RCP officiel · rubrique 4.2 Posologie</a>
      </div>`;
    }

    async function refresh() {
      const current = ++requestId;
      const term = fold(query.value);
      results.replaceChildren();
      if (!panel.isConnected) return;
      status.textContent = 'Chargement du catalogue BDPM…';
      let data;
      try {
        data = await loadCatalogue();
      } catch {
        if (panel.isConnected && current === requestId) {
          status.textContent = 'Catalogue indisponible. Réessayez ou ouvrez la base publique.';
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'secondary';
          retry.textContent = 'Réessayer';
          retry.onclick = refresh;
          results.replaceChildren(retry);
        }
        return;
      }
      if (!panel.isConnected || current !== requestId) return;
      const shortList = Object.keys(references).map(cis => data.byCode.get(cis)).filter(drug => drug?.active);
      const hits = term.length >= 2 ? search(data.specialties, term, historical.checked) : shortList;
      const date = value => value.split('-').reverse().join('/');
      panel.querySelector('[data-bdpm-version]').textContent =
        `Fichiers BDPM · spécialités ${date(data.specialtiesDate)} · compositions ${date(data.compositionDate)}`;
      status.textContent = term.length < 2 ? 'Accès rapide · spécialités avec repères intégrés' :
        hits.length === 0 ? 'Aucune spécialité trouvée.' :
        hits.length > 16 ? `${hits.length} résultats. Affinez la recherche pour réduire la liste.` :
        `${hits.length} résultat${hits.length === 1 ? '' : 's'}`;
      results.replaceChildren(...hits.slice(0, 16).map(drug => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bdpm-result';
        button.textContent = drug.name + (drug.active ? '' : ' · ' + drug.authorization + ' / ' + drug.market);
        button.onclick = () => showDrug(drug);
        return button;
      }));
    }

    query.oninput = () => {
      clearTimeout(timer);
      requestId++;
      results.replaceChildren();
      timer = setTimeout(refresh, 160);
    };
    query.onkeydown = event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        clearTimeout(timer);
        refresh();
      }
    };
    historical.onchange = () => {
      clearTimeout(timer);
      refresh();
    };
    drugName.oninput = () => {
      if (!drugCode.value) return;
      drugCode.value = '';
      details.replaceChildren();
    };
    refresh();
  }

  window.ParcoursBdpm = { mount };
})();
