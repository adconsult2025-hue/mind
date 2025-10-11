import { allCustomers, allCER, saveCER, uid, progressCERs, saveProgressCERs } from './storage.js';
import { saveDocFile, statutoTemplate, regolamentoTemplate, attoCostitutivoTemplate, adesioneTemplate, delegaGSETemplate, contrattoTraderTemplate, informativaGDPRTemplate } from './docs.js';

const form = document.getElementById('form-cer');
const membersBox = document.getElementById('members-picker');
const listEl = document.getElementById('cer-list');
const searchEl = document.getElementById('search-cer');

let customers = allCustomers();
let cers = allCER();
let editingId = null; // <-- modalità modifica

/** Render del picker membri; se passi selectedRoles {id: ruolo} preseleziona check e ruolo */
function renderMembersPicker(selectedRoles = {}) {
  membersBox.innerHTML = '';
  if (!customers.length) {
    membersBox.innerHTML = '<p class="note">Non ci sono clienti. Vai al CRM per crearli.</p>';
    return;
  }
  customers.forEach(c => {
    const checked = selectedRoles[c.id] ? 'checked' : '';
    const roleVal = selectedRoles[c.id] || c.ruolo || 'Consumer';
    const row = document.createElement('div');
    row.className = 'member-pick';
    row.innerHTML = `
      <input type="checkbox" id="cb_${c.id}" data-id="${c.id}" ${checked}/>
      <label for="cb_${c.id}">${c.nome} <small class="badge blue">${c.pod}</small></label>
      <select class="role">
        <option value="Consumer"  ${roleVal==='Consumer'?'selected':''}>Consumer</option>
        <option value="Prosumer"  ${roleVal==='Prosumer'?'selected':''}>Prosumer</option>
        <option value="Produttore"${roleVal==='Produttore'?'selected':''}>Produttore</option>
      </select>
      <span class="badge">${c.comune||''} · ${c.cabina||''}</span>
    `;
    membersBox.appendChild(row);
  });
}

function renderCERList() {
  const q = (searchEl.value||'').toLowerCase().trim();
  listEl.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'row header';
  header.innerHTML = `
    <div>Denominazione</div><div>Cabina</div><div>Comune</div><div>Riparto</div><div>Quota</div><div>Azioni</div>
  `;
  listEl.appendChild(header);

  cers
    .filter(c => !q || [c.nome, c.cabina, c.comune].some(x => (x||'').toLowerCase().includes(q)))
    .forEach(cer => {
      const r = document.createElement('div');
      r.className = 'row';
      const rip = cer.riparto === 'Personalizzato'
        ? `Prod. ${cer.rp_prod}% · Pros. ${cer.rp_pros}% · CER ${cer.rp_cer}%`
        : (cer.riparto || '');
      r.innerHTML = `
        <div class="col-name" title="${cer.nome}">
          <strong>${cer.nome}</strong><br/><small>${cer.cf||''}</small>
        </div>
        <div class="col-cabina" title="${cer.cabina}"><span class="badge blue">${cer.cabina||''}</span></div>
        <div class="col-comune" title="${cer.comune||''}">${cer.comune||''}</div>
        <div class="col-riparto" title="${rip}">${rip}</div>
        <div class="col-quota"><span class="badge green">${cer.quota||0}%</span></div>
        <div class="actions">
          <button class="btn ghost" data-edit="${cer.id}">Modifica</button>
          <button class="btn ghost" data-docs="${cer.id}">Documenti</button>
          <button class="btn danger" data-del="${cer.id}">Elimina</button>
        </div>
      `;

      // elimina
      r.querySelector('[data-del]').onclick = () => {
        if (!confirm('Eliminare la CER?')) return;
        cers = cers.filter(x => x.id !== cer.id);
        saveCER(cers);
        renderCERList();
      };

      // modifica
      r.querySelector('[data-edit]').onclick = () => startEdit(cer);

      // documenti
      r.querySelector('[data-docs]').onclick = () => openDocs(cer);

      listEl.appendChild(r);
    });
}

/** Carica una CER nel form per modificarla */
function startEdit(cer){
  editingId = cer.id;
  // riempi campi base
  const map = { nome:'nome', cabina:'cabina', comune:'comune', cf:'cf', quota:'quota', riparto:'riparto', rp_prod:'rp_prod', rp_pros:'rp_pros', rp_cer:'rp_cer', trader:'trader' };
  Object.keys(map).forEach(k => {
    const el = form.elements.namedItem(map[k]);
    if (el && cer[k] != null) el.value = cer[k];
  });

  // membri: crea mappa id->ruolo e render con preselezione
  const selected = {};
  (cer.membri||[]).forEach(m => { selected[m.id] = m.ruolo || 'Consumer'; });
  renderMembersPicker(selected);

  // porta in alto e cambia label bottone submit
  const submit = form.querySelector('button[type=submit], .btn[type=submit]');
  if (submit) submit.textContent = 'Aggiorna CER';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Apertura pannello documenti + cronoprogramma */
function openDocs(cer) {
  const membri = cer.membri || [];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="card soft">
      <h3>Genera documenti — ${cer.nome}</h3>
      <div class="actions">
        <button class="btn" id="btnStatuto">Statuto (.doc)</button>
        <button class="btn" id="btnRegolamento">Regolamento (.doc)</button>
        <button class="btn" id="btnAtto">Atto costitutivo (.doc)</button>
        <select class="slim" id="membroPick"></select>
        <button class="btn" id="btnAdesione">Adesione membro (.doc)</button>
        <button class="btn" id="btnDelega">Delega GSE (.doc)</button>
        <button class="btn" id="btnTrader">Contratto Trader (.doc)</button>
        <button class="btn ghost" id="btnPrivacy">Informativa GDPR (.doc)</button>
      </div>
      <p class="note">Le bozze sono basate sui dati attuali della CER e dei membri.</p>
    </div>
    <div class="card soft">
      <h3>Cronoprogramma CER</h3>
      <div id="cerProgress"></div>
    </div>
  `;
  const row = document.createElement('div');
  row.className = 'row';
  row.style.gridTemplateColumns = '1fr';
  row.appendChild(wrap);
  listEl.prepend(row);

  // doc handlers
  wrap.querySelector('#btnStatuto').onclick = () => saveDocFile(`Statuto_${cer.nome}.doc`, statutoTemplate(cer, membri));
  wrap.querySelector('#btnRegolamento').onclick = () => saveDocFile(`Regolamento_${cer.nome}.doc`, regolamentoTemplate(cer, membri));
  wrap.querySelector('#btnAtto').onclick = () => saveDocFile(`AttoCostitutivo_${cer.nome}.doc`, attoCostitutivoTemplate(cer));

  const pick = wrap.querySelector('#membroPick');
  pick.innerHTML = (membri||[]).map(m => `<option value="${m.id}">${m.nome} — ${m.ruolo}</option>`).join('');
  wrap.querySelector('#btnAdesione').onclick = () => {
    const id = pick.value;
    const m = (membri||[]).find(x => x.id === id) || membri[0];
    if (!m) return alert('Nessun membro disponibile.');
    saveDocFile(`Adesione_${cer.nome}_${m.nome}.doc`, adesioneTemplate(cer, m));
  };
  wrap.querySelector('#btnDelega').onclick = () => saveDocFile(`DelegaGSE_${cer.nome}.doc`, delegaGSETemplate(cer, cer.nome + ' — Legale Rappresentante'));
  wrap.querySelector('#btnTrader').onclick = () => saveDocFile(`ContrattoTrader_${cer.nome}.doc`, contrattoTraderTemplate(cer));
  wrap.querySelector('#btnPrivacy').onclick = () => saveDocFile(`InformativaPrivacy_${cer.nome}.doc`, informativaGDPRTemplate({ denominazione: cer.nome }));

  // cronoprogramma
  const progEl = wrap.querySelector('#cerProgress');
  renderCerProgress(progEl, cer);
}

/** Salva o aggiorna la CER dal form */
form.onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const cer = Object.fromEntries(fd.entries());
  cer.id = editingId || uid('cer');

  // normalizza riparti
  if (cer.riparto !== 'Personalizzato') {
    if (cer.riparto === 'Produttore85_CER15') { cer.rp_prod = 85; cer.rp_pros = 0; cer.rp_cer = 15; }
    if (cer.riparto === 'Produttore70_CER30') { cer.rp_prod = 70; cer.rp_pros = 0; cer.rp_cer = 30; }
  } else {
    cer.rp_prod = Number(cer.rp_prod||0);
    cer.rp_pros = Number(cer.rp_pros||0);
    cer.rp_cer  = Number(cer.rp_cer||0);
    const sum = cer.rp_prod + cer.rp_pros + cer.rp_cer;
    if (sum !== 100) { alert('La somma dei riparti personalizzati deve essere 100%.'); return; }
  }

  // membri selezionati + ruoli
  const picks = [...membersBox.querySelectorAll('.member-pick')].map(el => {
    const cb = el.querySelector('input[type=checkbox]');
    if (!cb.checked) return null;
    const id = cb.dataset.id;
    const role = el.querySelector('.role').value;
    const c = customers.find(x => x.id === id);
    return c ? { id: c.id, nome: c.nome, pod: c.pod, comune: c.comune, ruolo: role } : null;
  }).filter(Boolean);
  if (!picks.length) { alert('Seleziona almeno un membro dalla lista.'); return; }
  cer.membri = picks;

  // inserisci o aggiorna
  const idx = cers.findIndex(x => x.id === cer.id);
  if (idx >= 0) cers[idx] = { ...cers[idx], ...cer };
  else cers.push(cer);

  saveCER(cers);
  form.reset();
  editingId = null;
  const submit = form.querySelector('button[type=submit], .btn[type=submit]');
  if (submit) submit.textContent = 'Crea CER';
  if (searchEl) searchEl.value = '';
  // ripristina picker "pulito"
  renderMembersPicker();
  renderCERList();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
};

searchEl.oninput = renderCERList;

// inizializzazione
renderMembersPicker();
renderCERList();

/** Cronoprogramma CER */
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
      const [p,k] = cb.dataset.k.split('.');
      const cur = progressCERs();
      const obj = cur[cer.id] || { p1:{statuto:false,regolamento:false,atto:false}, p2:{adesioni:false,delega:false,trader:false}, p3:{rendicontazione:false,aggiornamenti:false,privacy:false} };
      obj[p][k] = cb.checked;
      cur[cer.id] = obj;
      saveProgressCERs(cur);
    };
  });
  container.innerHTML = ''; container.appendChild(wrap);
}
