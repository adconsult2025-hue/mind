// assets/js/storage.js

import { cloneDemoCustomers } from './data/demo_customers.js';

// mini wrapper su localStorage
const DB = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

let demoCustomersSeeded = false;

function ensureDemoCustomers() {
  if (demoCustomersSeeded) return;
  const existing = DB.get('customers', []);
  if (!Array.isArray(existing) || existing.length === 0) {
    DB.set('customers', cloneDemoCustomers());
  }
  demoCustomersSeeded = true;
}

// --- Customers ---
export function allCustomers() {
  ensureDemoCustomers();
  return DB.get('customers', []);
}
export function saveCustomers(list) {
  demoCustomersSeeded = true;
  DB.set('customers', list);
}

// --- CER ---
export function allCER() { return DB.get('cers', []); }
export function saveCER(list) { DB.set('cers', list); }

// --- Allegati clienti ---
export function attachmentsCustomers() {
  return DB.get('attachments_customers', {});
}
export function saveAttachmentsCustomers(obj) {
  DB.set('attachments_customers', obj);
}

// --- UID ---
export function uid(prefix='id') {
  return prefix + '_' + Math.random().toString(36).slice(2,10);
}

// --- Progress CRM (per cliente) ---
export function progressCustomers() { 
  return DB.get('progress_customers', {}); 
}
export function saveProgressCustomers(obj) { 
  DB.set('progress_customers', obj); 
}

// --- Progress CER (per CER) ---
export function progressCERs() { 
  return DB.get('progress_cers', {}); 
}
export function saveProgressCERs(obj) { 
  DB.set('progress_cers', obj); 
}
