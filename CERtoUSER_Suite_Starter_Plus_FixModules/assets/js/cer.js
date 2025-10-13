import { allCustomers, allCER, saveCER, uid, progressCERs, saveProgressCERs } from './storage.js';
import { saveDocFile, statutoTemplate, regolamentoTemplate, attoCostitutivoTemplate, adesioneTemplate, delegaGSETemplate, contrattoTraderTemplate, informativaGDPRTemplate } from './docs.js';

const form = document.getElementById('form-cer');
const membersBox = document.getElementById('members-picker');
const plantsBox = document.getElementById('plants-list');
const listEl = document.getElementById('cer-list');
const searchEl = document.getElementById('search-cer');
const addPlantBtn = document.getElementById('add-plant');

let customers = allCustomers();
let cers = allCER();

function selectedMembers() {
  return [...membersBox.querySelectorAll('.member-pick')]
    .map(row => {
      const cb = row.querySelector('input[type=checkbox]');
      if (!cb.checked) return null;
      const id = cb.dataset.id;
      const role = row.querySelector('.role').value;
      const customer = customers.find(x => x.id === id) || {};
      return {
        id,
        nome: customer.nome || 'Membro',
        pod: customer.pod || '',
        comune: customer.comune || '',
        ruolo: role
      };
    })
    .filter(Boolean);
}

function eligibleOwners() {
  return selectedMembers().filter(m => m.ruolo === 'Produttore' || m.ruolo === 'Prosumer');
}

function refreshPlantOwners(plant) {
  const ownerSelect = plant.querySelector('.owner');
  if (!ownerSelect) return;
  const current = ownerSelect.value;
  const owners = eligibleOwners();
  ownerSelect.innerHTML = '<option value="">Seleziona membro</option>';
  owners.forEach(owner => {
    const opt = document.createElement('option');
    opt.value = owner.id;
    opt.textContent = `${owner.nome} — ${owner.ruolo}`;
    if (owner.id === current) opt.selected = true;
    ownerSelect.appendChild(opt);
  });
  if (!ownerSelect.value && owners.length === 1) {
    ownerSelect.value = owners[0].id;
  }
}

function refreshPlantShares(plant) {
  const wrap = plant.querySelector('.shares-grid');
  if (!wrap) return;
  const previous = new Map([...wrap.querySelectorAll('input[data-member]')].map(inp => [inp.dataset.member, inp.value]));
  wrap.innerHTML = '';
  const members = selectedMembers();
  if (!members.length) {
    wrap.innerHTML = '<p class="note">Seleziona membri per definire le percentuali di riparto.</p>';
    return;
  }
  members.forEach(member => {
    const label = document.createElement('label');
    const title = document.createElement('span');
    title.textContent = member.nome;
    const role = document.createElement('small');
    role.textContent = member.ruolo;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = '0.1';
    input.dataset.member = member.id;
    input.name = `share_${plant.dataset.id}_${member.id}`;
    const prev = previous.get(member.id);
    input.value = prev !== undefined ? prev : '0';
    label.appendChild(title);
    label.appendChild(role);
    label.appendChild(input);
    wrap.appendChild(label);
  });
}

function refreshAllPlants() {
  [...plantsBox.querySelectorAll('.plant')].forEach(plant => {
    refreshPlantOwners(plant);
    refreshPlantShares(plant);
  });
}

function handleMemberChange() {
  refreshAllPlants();
}

function addPlant(data = {}) {
  const plant = document.createElement('div');
  plant.className = 'plant';
  const pid = data.id || uid('plant');
  plant.dataset.id = pid;
  plant.innerHTML = `
    <div class="plant-grid">
      <label>Nome impianto
        <input type="text" data-k="name" value="${data.nome || ''}" required/>
      </label>
      <label>Potenza (kWp)
        <input type="number" min="0" step="0.1" data-k="kwp" value="${data.potenza_kwp || ''}"/>
      </label>
      <label>Titolare impianto
        <select class="owner" data-k="owner" required>
          <option value="">Seleziona membro</option>
        </select>
      </label>
    </div>
    <div class="plant-shares">
      <h4>Ripartizione percentuale</h4>
      <div class="shares-grid" data-k="shares"></div>
    </div>
    <button type="button" class="btn danger remove-plant">Rimuovi impianto</button>
  `;
  const ownerSelect = plant.querySelector('.owner');
  if (data.titolareId) ownerSelect.value = data.titolareId;
  plantsBox.appendChild(plant);
  refreshPlantOwners(plant);
  refreshPlantShares(plant);
  plant.querySelector('.remove-plant').onclick = () => {
    plant.remove();
  };
  return plant;
}

function serializePlant(plant, members) {
  const nameInput = plant.querySelector('[data-k="name"]');
  const kwpInput = plant.querySelector('[data-k="kwp"]');
  const ownerSelect = plant.querySelector('.owner');
  const name = (nameInput.value || '').trim();
  if (!name) {
    alert('Inserisci un nome per ogni impianto fotovoltaico.');
    nameInput.focus();
    return null;
  }
  const ownerId = ownerSelect.value;
  if (!ownerId) {
    alert(`Seleziona il titolare dell'impianto "${name}".`);
    ownerSelect.focus();
    return null;
  }
  const ownerMember = members.find(m => m.id === ownerId);
  if (!ownerMember || (ownerMember.ruolo !== 'Produttore' && ownerMember.ruolo !== 'Prosumer')) {
    alert('Il titolare di un impianto deve essere un Prosumer o un Produttore.');
    ownerSelect.focus();
    return null;
  }
  const shareInputs = [...plant.querySelectorAll('.shares-grid input[data-member]')];
  if (!shareInputs.length) {
    alert(`Seleziona almeno un membro per ripartire l'impianto "${name}".`);
    return null;
  }
  let total = 0;
  const shares = shareInputs.map(input => {
    const value = Number(input.value || 0);
    total += value;
    return { membroId: input.dataset.member, percentuale: value };
  });
  if (!shares.some(s => s.percentuale > 0)) {
    alert(`Definisci le percentuali di riparto per l'impianto "${name}".`);
    return null;
  }
  const totalRounded = Math.round(total * 100) / 100;
  if (Math.abs(totalRounded - 100) > 0.01) {
    alert(`La somma delle percentuali per l'impianto "${name}" deve essere 100%. Attuale: ${totalRounded.toFixed(2)}%.`);
    return null;
  }
  const kwp = kwpInput.value ? Number(kwpInput.value) : null;
  return {
    id: plant.dataset.id,
    nome: name,
    potenza_kwp: kwp,
    titolareId: ownerId,
    titolareNome: ownerMember.nome,
    titolareRuolo: ownerMember.ruolo,
    shares
  };
}

function renderMembersPicker() {
  membersBox.innerHTML = '';
  if (!customers.length) {
    membersBox.innerHTML = '<p class="note">Non ci sono clienti. Vai al CRM per crearli.</p>';
    handleMemberChange();
    return;
  }
  customers.forEach(c => {
    const row = document.createElement('div');
    row.className = 'member-pick';
    row.innerHTML = `
      <input type="checkbox" id="cb_${c.id}" data-id="${c.id}"/>
      <label for="cb_${c.id}">${c.nome} <small class="badge blue">${c.pod}</small></label>
      <select class="role">
        <option value="Consumer" ${c.ruolo==='Consumer'?'selected':''}>Consumer</option>
        <option value="Prosumer" ${c.ruolo==='Prosumer'?'selected':''}>Prosumer</option>
        <option value="Produttore" ${c.ruolo==='Produttore'?'selected':''}>Produttore</option>
      </select>
      <span class="badge">${c.comune||''} · ${c.cabina||''}</span>
    `;
    membersBox.appendChild(row);
    const cb = row.querySelector('input[type=checkbox]');
    const roleSel = row.querySelector('.role');
    cb.onchange = handleMemberChange;
    roleSel.onchange = () => {
      c.ruolo = roleSel.value;
      handleMemberChange();
    };
  });
  handleMemberChange();
}

function renderCERList() {
  const q = (searchEl.value||'').toLowerCase().trim();
  listEl.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'row header';
  header.innerHTML = '<div>Denominazione</div><div>Cabina</div><div>Comune</div><div>Riparto</div><div>Quota</div><div>Azioni</div>';
  listEl.appendChild(header);

  cers
    .filter(c => !q || [c.nome, c.cabina, c.comune].some(x => (x||'').toLowerCase().includes(q)))
    .forEach(cer => {
      const r = document.createElement('div');
      r.className = 'row';
      const rip = cer.riparto === 'Personalizzato'
        ? `P${cer.rp_prod}/S${cer.rp_pros}/CER${cer.rp_cer}`
        : cer.riparto;
      const impCount = cer.impianti ? cer.impianti.length : 0;
      const impBadge = `<span class="badge ${impCount ? 'green' : ''}">${impCount} impianto${impCount === 1 ? '' : 'i'}</span>`;
      r.innerHTML = `
        <div><strong>${cer.nome}</strong><br/><small>${cer.cf||''}</small></div>
        <div>${cer.cabina}</div>
        <div>${cer.comune}</div>
        <div>${rip}<br/>${impBadge}</div>
        <div>${cer.quota}%</div>
        <div class="actions">
          <button class="btn ghost" data-docs="${cer.id}">Documenti</button>
          <button class="btn danger" data-del="${cer.id}">Elimina</button>
        </div>
      `;
      r.querySelector('[data-del]').onclick = () => {
        if (!confirm('Eliminare la CER?')) return;
        cers = cers.filter(x => x.id !== cer.id); saveCER(cers); renderCERList();
      };
      r.querySelector('[data-docs]').onclick = () => openDocs(cer);
      listEl.appendChild(r);
    });
}

function openDocs(cer) {
  const membri = cer.membri || [];
  const html = `\n    <div class=\"card soft\">\n      <h3>Genera documenti — ${cer.nome}</h3>\n      <div class=\"actions\">\n        <button class=\"btn\" id=\"btnStatuto\">Statuto (.doc)</button>\n        <button class=\"btn\" id=\"btnRegolamento\">Regolamento (.doc)</button>\n        <button class=\"btn\" id=\"btnAtto\">Atto costitutivo (.doc)</button>\n        <select class=\"slim\" id=\"membroPick\"></select>\n        <button class=\"btn\" id=\"btnAdesione\">Adesione membro (.doc)</button>\n        <button class=\"btn\" id=\"btnDelega\">Delega GSE (.doc)</button>\n        <button class=\"btn\" id=\"btnTrader\">Contratto Trader (.doc)</button>\n        <button class=\"btn ghost\" id=\"btnPrivacy\">Informativa GDPR (.doc)</button>\n      </div>\n      <p class=\"note\">Le bozze sono basate sui dati attuali della CER e dei membri.</p>\n    </div>\n    <div class=\"card soft\">\n      <h3>Cronoprogramma CER</h3>\n      <div id=\"cerProgress\"></div>\n    </div>\n  `;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const row = document.createElement('div'); row.className = 'row';
  row.style.gridTemplateColumns = '1fr'; row.appendChild(wrap);
  listEl.prepend(row);

  wrap.querySelector('#btnStatuto').onclick = () => {
    const doc = statutoTemplate(cer, membri);
    saveDocFile(`Statuto_${cer.nome}.doc`, doc);
  };
  wrap.querySelector('#btnRegolamento').onclick = () => {
    const doc = regolamentoTemplate(cer, membri);
    saveDocFile(`Regolamento_${cer.nome}.doc`, doc);
  };
}

form.onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const cer = Object.fromEntries(fd.entries());
  cer.id = uid('cer');
  // normalize riparti
  if (cer.riparto !== 'Personalizzato') {
    if (cer.riparto === 'Produttore85_CER15') {
      cer.rp_prod = 85; cer.rp_pros = 0; cer.rp_cer = 15;
    }
    if (cer.riparto === 'Produttore70_CER30') {
      cer.rp_prod = 70; cer.rp_pros = 0; cer.rp_cer = 30;
    }
  } else {
    cer.rp_prod = Number(cer.rp_prod||0);
    cer.rp_pros = Number(cer.rp_pros||0);
    cer.rp_cer  = Number(cer.rp_cer||0);
    const sum = cer.rp_prod + cer.rp_pros + cer.rp_cer;
    if (sum !== 100) { alert('La somma dei riparti personalizzati deve essere 100%.'); return; }
  }
  // membri selezionati
  const picks = selectedMembers();
  if (!picks.length) { alert('Seleziona almeno un membro dalla lista.'); return; }
  cer.membri = picks;

  const plantEls = [...plantsBox.querySelectorAll('.plant')];
  if (!plantEls.length) {
    alert('Aggiungi almeno un impianto fotovoltaico alla CER.');
    return;
  }
  const plants = [];
  for (const plantEl of plantEls) {
    const serialized = serializePlant(plantEl, picks);
    if (!serialized) return;
    plants.push(serialized);
  }
  cer.impianti = plants;

  cers.push(cer);
  saveCER(cers);
  form.reset();
  renderCERList();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
};

form.onreset = () => {
  setTimeout(() => {
    plantsBox.innerHTML = '';
    addPlant();
    handleMemberChange();
  }, 0);
};

if (addPlantBtn) {
  addPlantBtn.onclick = () => {
    addPlant();
    handleMemberChange();
  };
}

searchEl.oninput = renderCERList;

renderMembersPicker();
addPlant();
handleMemberChange();
renderCERList();


function renderCerProgress(container, cer){
  const store = progressCERs();
  const st = store[cer.id] || { p1:{statuto:false,regolamento:false,atto:false}, p2:{adesioni:false,delega:false,trader:false}, p3:{rendicontazione:false,aggiornamenti:false,privacy:false} };
  const wrap = document.createElement('div');
  wrap.className = 'progress';
  wrap.innerHTML = `
    <div class="phase"><h4>Fase 1 — Costituzione</h4>
      <label class="chk"><input type="checkbox" data-k="p1.statuto" ${st.p1.statuto?'checked':''}/> Statuto approvato</label>
      <label class="chk"><input type="checkbox" data-k="p1.regolamento" ${st.p1.regolamento?'checked':''}/> Regolamento approvato</label>
      <label class="chk"><input type="checkbox" data-k="p1.atto" ${st.p1.atto?'checked':''}/> Atto costitutivo firmato</label>
    </div>
    <div class="phase"><h4>Fase 2 — Attivazione</h4>
      <label class="chk"><input type="checkbox" data-k="p2.adesioni" ${st.p2.adesioni?'checked':''}/> Adesioni membri caricate</label>
      <label class="chk"><input type="checkbox" data-k="p2.delega" ${st.p2.delega?'checked':''}/> Delega GSE caricata</label>
      <label class="chk"><input type="checkbox" data-k="p2.trader" ${st.p2.trader?'checked':''}/> Contratto Trader firmato</label>
    </div>
    <div class="phase"><h4>Fase 3 — Operatività</h4>
      <label class="chk"><input type="checkbox" data-k="p3.rendicontazione" ${st.p3.rendicontazione?'checked':''}/> Rendicontazione attiva</label>
      <label class="chk"><input type="checkbox" data-k="p3.aggiornamenti" ${st.p3.aggiornamenti?'checked':''}/> Aggiornamenti membri</label>
      <label class="chk"><input type="checkbox" data-k="p3.privacy" ${st.p3.privacy?'checked':''}/> Privacy & registri</label>
    </div>
  `;
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.onchange = () => {
      const k = cb.dataset.k.split('.');
      const cur = progressCERs();
      const obj = cur[cer.id] || { p1:{statuto:false,regolamento:false,atto:false}, p2:{adesioni:false,delega:false,trader:false}, p3:{rendicontazione:false,aggiornamenti:false,privacy:false} };
      obj[k[0]][k[1]] = cb.checked;
      cur[cer.id] = obj;
      saveProgressCERs(cur);
    };
  });
  container.innerHTML = ''; container.appendChild(wrap);
}
