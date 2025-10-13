const billsStore = new Map();
const consumiStore = [];
const clientPods = new Map();
const logs = [];

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  billsStore,
  consumiStore,
  clientPods,
  logs,
  uid
};
