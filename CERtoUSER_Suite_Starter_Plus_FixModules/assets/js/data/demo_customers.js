export const DEMO_CUSTOMERS = [
  {
    id: 'client_demo_001',
    nome: 'Mario Rossi',
    tipo: 'Privato',
    pod: 'IT001E1234567890',
    comune: 'Frosinone',
    cabina: 'CP-001',
    email: 'mario.rossi@example.com',
    tel: '+39 333 1234567',
    ruolo: 'Consumer'
  },
  {
    id: 'client_demo_002',
    nome: 'Solaria S.r.l.',
    tipo: 'P.IVA',
    pod: 'IT001E9876543210',
    comune: 'Frosinone',
    cabina: 'CP-001',
    email: 'info@solaria.it',
    tel: '+39 0775 222333',
    ruolo: 'Produttore'
  },
  {
    id: 'client_demo_003',
    nome: 'Lucia Bianchi',
    tipo: 'Privato',
    pod: 'IT003E4567981230',
    comune: 'Sora',
    cabina: 'CP-045',
    email: 'lucia.bianchi@example.com',
    tel: '+39 320 5558899',
    ruolo: 'Prosumer'
  },
  {
    id: 'client_demo_004',
    nome: 'Condominio Aurora',
    tipo: 'Condominio',
    pod: 'IT003E9988776655',
    comune: 'Sora',
    cabina: 'CP-045',
    email: 'amministratore@aurora.it',
    tel: '+39 0776 445566',
    ruolo: 'Consumer'
  },
  {
    id: 'client_demo_005',
    nome: 'Verdi Impianti',
    tipo: 'P.IVA',
    pod: 'IT007E1122334455',
    comune: 'Cassino',
    cabina: 'CP-088',
    email: 'contatti@verdiimpianti.it',
    tel: '+39 0776 889977',
    ruolo: 'Produttore'
  }
];

export function cloneDemoCustomers() {
  return DEMO_CUSTOMERS.map((customer) => ({ ...customer }));
}
