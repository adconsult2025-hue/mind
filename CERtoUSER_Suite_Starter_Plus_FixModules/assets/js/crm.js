
import { allCustomers, saveCustomers, uid, progressCustomers, saveProgressCustomers } from './storage.js';


const form = document.getElementById('form-customer');
const listEl = document.getElementById('customers-list');
const searchEl = document.getElementById('search');

let customers = allCustomers();

function render() {
  const q = (searchEl.value||'').toLowerCase().trim();
  const rows = [];
  rows.push(rowHeader());
  customers
    .filter(c => !q || [c.nome, c.pod, c.comune, c.cabina, c.tipo].some(x => (x||'').toLowerCase().includes(q)))
    .forEach(c => rows.push(rowItem(c)));
  listEl.innerHTML = '';
  rows.forEach(r => listEl.appendChild(r));
}

function rowHeader() {
  const r = document.createElement('div');
  r.className = 'row header';
  r.innerHTML = '<div>Cliente</div><div>POD</div><div>Comune</div><div>Cabina</div><div>Ruolo</div><div>Azioni</div>';
  return r;
}

function rowItem(c) {
  const r = document.createElement('div');
  r.className = 'row';
  r.innerHTML = `\n    <div><strong>${c.nome}</strong><br/><small>${c.tipo} — ${c.email||''} ${c.tel?('· '+c.tel):''}</small></div>\n    <div><span class="badge blue">${c.pod}</span></div>\n    <div>${c.comune||''}</div>\n    <div>${c.cabina||''}</div>\n    <div><span class="badge green">${c.ruolo||'Consumer'}</span></div>\n    <div class="actions">\n      <button class="btn ghost" data-edit="${c.id}">Modifica</button>\n      <button class="btn ghost" data-prog="${c.id}">Cronoprogramma</button>\n      <button class="btn danger" data-del="${c.id}">Elimina</button>\n    </div>\n  `;
  r.querySelector('[data-del]').onclick = () => {
    if (!confirm('Eliminare il cliente?')) return;
    customers = customers.filter(x => x.id !== c.id);
    saveCustomers(customers); render();
  };
  r.querySelector('[data-edit]').onclick = () => editCustomer(c);
  return r;
}

function editCustomer(c) {
  for (const [k,v] of Object.entries(c)) {
    const el = form.elements.namedItem(k);
    if (el) el.value = v;
  }
  form.dataset.editing = c.id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

form.onsubmit = (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  data.id = form.dataset.editing || uid('cust');
  // enforce POD unique
  const dup = customers.find(x => x.pod.trim().toUpperCase() === data.pod.trim().toUpperCase() && x.id !== data.id);
  if (dup) { alert('POD già presente per il cliente: ' + dup.nome); return; }
  data.pod = data.pod.trim().toUpperCase();

  if (form.dataset.editing) {
    customers = customers.map(x => x.id === data.id ? {...x, ...data} : x);
  } else {
    customers.push(data);
  }
  saveCustomers(customers);
  form.reset();
  delete form.dataset.editing;
  render();
};

searchEl.oninput = render;
render();


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
      const k = cb.dataset.k.split('.');
      const cur = progressCustomers();
      const obj = cur[c.id] || { p1:{a:false,b:false,c:false}, p2:{a:false,b:false,c:false}, p3:{a:false,b:false,c:false} };
      obj[k[0]][k[1]] = cb.checked;
      cur[c.id] = obj;
      saveProgressCustomers(cur);
    };
  });
  return wrap;
}

  // Add progress expander
  const progBtn = r.querySelector('[data-prog]');
  progBtn.onclick = () => {
    const exists = r.nextElementSibling && r.nextElementSibling.classList.contains('row-prog');
    if (exists) { r.nextElementSibling.remove(); return; }
    const ph = document.createElement('div');
    ph.className = 'row-prog';
    ph.style.gridColumn = '1 / -1';
    const wrap = document.createElement('div');
    wrap.className = 'card soft';
    wrap.appendChild(renderCustProgress(c));
    ph.appendChild(wrap);
    listEl.insertBefore(ph, r.nextSibling);
  };
