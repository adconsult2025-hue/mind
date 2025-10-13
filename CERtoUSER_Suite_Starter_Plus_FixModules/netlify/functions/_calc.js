function splitPlant(plant, alloc, weights) {
  const E = Number(alloc.energy_shared_kwh || 0);
  const pctCER = Number(plant.pct_cer || 0);
  const pctX = Number(plant.pct_contra || 0);
  if (pctCER + pctX !== 100) throw new Error('Percentuali impianto non sommano 100');

  const Qcer = E * pctCER / 100;
  const res = {
    consumers: [],
    producers: [],
    prosumers: [],
    totals: { E, cer: Qcer, contra: E * pctX / 100 }
  };

  const consumerWeights = (weights.consumers || []).reduce((sum, x) => sum + Number(x.kwh_basis || 0), 0);
  if (Qcer > 0 && consumerWeights <= 0) throw new Error('Base consumer nulla con pctCER>0');
  (weights.consumers || []).forEach(x => {
    const w = Number(x.kwh_basis || 0);
    const share = consumerWeights > 0 ? Qcer * (w / consumerWeights) : 0;
    res.consumers.push({ member_id: x.member_id, kwh: share });
  });

  const Qx = res.totals.contra;
  if (plant.tipologia === 'A') {
    const producerWeights = (weights.producers || []).reduce((sum, x) => sum + Number(x.kwh_basis || 0), 0);
    if (Qx > 0 && producerWeights <= 0) throw new Error('Base produttori nulla con pctContra>0 (Tipologia A)');
    (weights.producers || []).forEach(x => {
      const w = Number(x.kwh_basis || 0);
      const share = producerWeights > 0 ? Qx * (w / producerWeights) : 0;
      res.producers.push({ member_id: x.member_id, kwh: share });
    });
  } else if (plant.tipologia === 'B') {
    const prosumerWeights = (weights.prosumers || []).reduce((sum, x) => sum + Number(x.kwh_basis || 0), 0);
    if (Qx > 0 && prosumerWeights <= 0) throw new Error('Base prosumer nulla con pctContra>0 (Tipologia B)');
    (weights.prosumers || []).forEach(x => {
      const w = Number(x.kwh_basis || 0);
      const share = prosumerWeights > 0 ? Qx * (w / prosumerWeights) : 0;
      res.prosumers.push({ member_id: x.member_id, kwh: share });
    });
  } else {
    throw new Error('Tipologia impianto non valida');
  }

  return res;
}

function aggregateCER(plantsResults) {
  const map = new Map();
  for (const r of plantsResults) {
    for (const x of (r.consumers || [])) map.set(x.member_id, (map.get(x.member_id) || 0) + x.kwh);
    for (const x of (r.producers || [])) map.set(x.member_id, (map.get(x.member_id) || 0) + x.kwh);
    for (const x of (r.prosumers || [])) map.set(x.member_id, (map.get(x.member_id) || 0) + x.kwh);
  }
  return Array.from(map, ([member_id, kwh]) => ({ member_id, kwh }));
}

module.exports = {
  splitPlant,
  aggregateCER
};
