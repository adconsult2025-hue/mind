import { allCustomers, saveCustomers, uid,
         progressCustomers, saveProgressCustomers,
         attachmentsCustomers, saveAttachmentsCustomers } from './storage.js';

const form     = document.getElementById('form-customer');
const listEl   = document.getElementById('customers-list');
const searchEl = document.getElementById('search');

let customers = allCustomers();

/* ---------- header ---------- */
function rowHeader() {
  const r = document.createElement('div');
  r.className = 'row header';
  r.innerHTML = `
    <div>Cliente</div>
    <div>POD</div>
    <div>Comune</div>
    <div>Cabina</div>
    <div>Ruolo</div>
    <div>Azioni</div>
  `;
  return r;
}

/* ---------- cronoprogramma panel ---------- */
function renderCustProgress(c){
  const store = progressCustomers();
  const st = store[c.id] || { p1:{a:false,b:false,c:false}, p2:{a:false,b:false,c:false}, p3:{a:false,b:false,c:false} };

  const wrap = document.createElement('div');
  wrap.className = 'progress';
  wrap.innerHTML = `
    <div class="phase"><h4>Fase 1 — Costituzione</h4>
      <label class="chk"><input type="checkbox" data-k="p1.a" ${st.p1.a?'checked':''}/> Documento identità & CF</label>
      <label class="chk"><input type="checkbox" data-k="p1.b" ${st.p1.b?'checked':''}/> Consenso privacy</label>
      <label class="chk"><input type="checkbox" data-k="p1.c" ${st.p1.c?'checked':''}/> Bolletta recente</label>
    </div>
    <div class="phase"><h4>Fase 2 — Attivazione</h4>
      <label class="chk"><input type="checkbox" data-k="p2.a" ${st.p2.a?'checked':''}/> Adesione alla CER</label>
      <label class="chk"><input type="checkbox" data-k="p2.b" ${st.p2.b?'checked':''}/> POD verificato in cabina</label>
      <label class="chk"><input type="checkbox" data-k="p2.c" ${st.p2.c?'checked':''}/> Delega GSE</label>
    </div>
    <div class="phase"><h4>Fase 3 — Operatività</h4>
      <label class="chk"><input type="checkbox" data-k="p3.a" ${st.p3.a?'checked':''}/> Riparti impostati</label>
      <label class="chk"><input type="checkbox" data-k="p3.b" ${st.p3.b?'checked':''}/> Rendicontazione avviata</label>
      <label class="chk"><input type="checkbox" data-k="p3.c" ${st.p3.c?'checked':''}/> Contratto eccedenze</label>
    </div>
  `;
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.onchange = () => {
      const [p,k] = cb.dataset.k.split('.');
      const cur = progressCustomers();
      const obj = cur[c.id] || { p1:{a:false,b:false,c:false}, p2:{a:false,b:false,c:false}, p3:{a:false,b:false,c:false} };
      obj[p][k] = cb.checked;
      cur[c.id] = obj;
      saveProgressCustomers(cur);
    };
  });
  return wrap;
}

/* ---------- allegati panel ---------- */
function renderAttachments(c){
  const store = attachmentsCustomers();
  const list = store[c.id] || [];
  const box = document.createElement('div');
  box.innerHTML = `
    <div class="card soft">
      <h4>Allegati cliente — ${c.nome}</h4>
      <div class="actions" style="margin:8px 0">
        <label class="btn ghost" style="cursor:pointer;">
          Carica file
          <input type="file" id="file_${c.id}" style="display:none" multiple>
        </label>
      </div>
      <div id="files_${c.id}">
        ${list.length ? '' : '<p class="note">Nessun file caricato.</p>'}
      </div>
    </div>
  `;

  const filesEl = box.querySelector(`#files_${c.id}`);
  function renderList() {
    if (!list.length) { filesEl.innerHTML = '<p class="note">Nessun file caricato.</p>'; return; }
    filesEl.innerHTML = list.map((f,i)=>`
      <div class="row" style="grid-template-columns:1fr auto">
        <div>${f.name} <small class="note">(${new Date(f.ts).toLocaleString('it-IT')})</small></div>
        <div class="actions">
          <a class="btn ghost" download="${f.name}" href="${f.dataURL}">Scarica</a>
          <button class="btn danger" data-del="${i}">Elimina</button>
        </div>
      </div>
    `).join('');
    filesEl.querySelectorAll('[data-del]').forEach(b=>{
      b.onclick = () => {
        const idx = Number(b.dataset.del);
        list.splice(idx,1);
        store[c.id] = list;
        saveAttachmentsCustomers(store);
        renderList();
      };
    });
  }
  renderList();

  // upload
  box.querySelector(`#file_${c.id}`).onchange = async (e) => {
    const files = [...(e.target.files||[])];
    for (const file of files) {
      const dataURL = await fileToDataURL(file);
      list.push({ name:file.name, dataURL, ts:Date.now() });
    }
    store[c.id] = list;
    saveAttachmentsCustomers(store);
    renderList();
    e.target.value = '';
  };

  return box;
}
function fileToDataURL(file){
  return new Promise(res=>{
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(file);
  });
}

/* ---------- row cliente ---------- */
function rowItem(c) {
  const r = document.createElement('div');
  r.className = 'row';
  r.innerHTML = `
    <div class="col-name" title="${c.nome}">
      <strong>${c.nome}</strong><br/>
      <small>${c.tipo||''} ${c.email?('— '+c.email):''} ${c.tel?('· '+c.tel):''}</small>
    </div>
    <div><span class="badge badge-pod" title="${c.pod}">${c.pod}</span></div>
    <div title="${c.comune||''}">${c.comune||''}</div>
    <div title="${c.cabina||''}">${c.cabina||''}</div>
    <div><span class="badge green">${c.ruolo||'Consumer'}</span></div>
    <div class="actions">
      <button class="btn ghost" data-edit="${c.id}">Modifica</button>
      <button class="btn ghost" data-prog="${c.id}">Cronoprogramma</button>
      <button class="btn ghost" data-files="${c.id}">Allegati</button>
      <button class="btn danger" data-del="${c.id}">Elimina</button>
    </div>
  `;

  // elimina
  r.querySelector('[data-del]').onclick = () => {
    if (!confirm('Eliminare il cliente?')) return;
    customers = customers.filter(x => x.id !== c.id);
    saveCustomers(customers); render();
  };

  // modifica (carica nel form)
  r.querySelector('[data-edit]').onclick = () => {
    for (const [k,v] of Object.entries(c)) {
      const el = form.elements.namedItem(k);
      if (el) el.value = v;
    }
    form.dataset.editing = c.id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // cronoprogramma (toggle riga sotto)
  r.querySelector('[data-prog]').onclick = () => {
    const next = r.nextElementSibling;
    if (next && next.classList.contains('row-prog')) { next.remove(); return; }
    const holder = document.createElement('div');
    holder.className = 'row-prog';
    holder.style.gridColumn = '1 / -1';
    const card = document.createElement('div');
    card.className = 'card soft';
    card.appendChild(renderCustProgress(c));
    holder.appendChild(card);
    listEl.insertBefore(holder, r.nextSibling);
  };

  // allegati (toggle riga sotto)
  r.querySelector('[data-files]').onclick = () => {
    const next = r.nextElementSibling;
    if (next && next.classList.contains('row-files')) { next.remove(); return; }
    const holder = document.createElement('div');
    holder.className = 'row-files';
    holder.style.gridColumn = '1 / -1';
    holder.appendChild(renderAttachments(c));
    listEl.insertBefore(holder, r.nextSibling);
  };

  return r;
}

/* ---------- render list ---------- */
function render() {
  const q = (searchEl?.value||'').toLowerCase().trim();
  listEl.innerHTML = '';
  listEl.appendChild(rowHeader());
  customers
    .filter(c => !q || [c.nome,c.pod,c.comune,c.cabina,c.tipo,c.ruolo].some(x => (x||'').toLowerCase().includes(q)))
    .forEach(c => listEl.appendChild(rowItem(c)));
}

/* ---------- submit ---------- */
form.onsubmit = (e) => {
  e.preventDefault();

  const get = (name) => (form.elements.namedItem(name)?.value || '').trim();
  const data = {
    id:    form.dataset.editing || uid('cust'),
    tipo:  get('tipo') || 'Privato',
    nome:  get('nome') || '(senza nome)',
    pod:   get('pod').toUpperCase(),
    cabina:get('cabina'),
    comune:get('comune'),
    email: get('email'),
    tel:   get('tel') || get('telefono') || '',
    ruolo: get('ruolo') || 'Consumer'
  };
  if (!data.pod) { alert('Inserisci il POD'); return; }
  const dup = customers.find(x => x.pod === data.pod && x.id !== data.id);
  if (dup) { alert('POD già presente per il cliente: ' + dup.nome); return; }

  const idx = customers.findIndex(x => x.id === data.id);
  if (idx >= 0) customers[idx] = {...customers[idx], ...data};
  else customers.push(data);

  saveCustomers(customers);

  form.reset();
  delete form.dataset.editing;
  if (searchEl) searchEl.value = '';
  render();
};

/* ---------- init ---------- */
searchEl && (searchEl.oninput = render);
render();
