// Simple storage layer
const DB = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

export function allCustomers() { return DB.get('customers', []); }
export function saveCustomers(list) { DB.set('customers', list); }

export function allCER() { return DB.get('cers', []); }
export function saveCER(list) { DB.set('cers', list); }

export function uid(prefix='id') {
  return prefix + '_' + Math.random().toString(36).slice(2,10);
}


export function progressCustomers() { return DB.get('progress_customers', {}); }
export function saveProgressCustomers(obj) { DB.set('progress_customers', obj); }

export function progressCERs() { return DB.get('progress_cers', {}); }
export function saveProgressCERs(obj) { DB.set('progress_cers', obj); }
export function progressCustomers() { 
  return JSON.parse(localStorage.getItem('progress_customers') || '{}'); 
}
export function saveProgressCustomers(obj) { 
  localStorage.setItem('progress_customers', JSON.stringify(obj)); 
}
