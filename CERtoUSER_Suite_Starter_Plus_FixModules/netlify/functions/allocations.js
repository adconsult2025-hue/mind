const { getPlants, findAllocation, ensureAllocation, saveAllocationResult } = require('./_data');
const { splitPlant, aggregateCER } = require('./_calc');

const headers = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers(), body: '' };
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const plantId = params.plant_id;
      const period = params.period;
      if (!plantId || !period) {
        return { statusCode: 400, headers: headers(), body: JSON.stringify({ ok: false, error: 'plant_id e period sono obbligatori' }) };
      }
      const allocation = findAllocation(plantId, period) || ensureAllocation(plantId, period);
      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: allocation })
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { cer_id, period, confirm } = body;
      if (!cer_id || !period) {
        return { statusCode: 400, headers: headers(), body: JSON.stringify({ ok: false, error: 'cer_id e period sono obbligatori' }) };
      }
      const plants = getPlants().filter(p => p.cer_id === cer_id);
      if (!plants.length) {
        return { statusCode: 404, headers: headers(), body: JSON.stringify({ ok: false, error: 'Nessun impianto per la CER indicata' }) };
      }

      const results = [];
      const errors = [];
      for (const plant of plants) {
        const allocation = findAllocation(plant.id, period) || ensureAllocation(plant.id, period);
        try {
          const split = splitPlant(plant, allocation, allocation.weights);
          results.push({
            plant_id: plant.id,
            name: plant.name,
            tipologia: plant.tipologia,
            pct_cer: plant.pct_cer,
            pct_contra: plant.pct_contra,
            energy_shared_kwh: allocation.energy_shared_kwh,
            weights: allocation.weights,
            allocations: split
          });
          if (confirm) {
            saveAllocationResult(plant.id, period, split);
          }
        } catch (err) {
          errors.push({ plant_id: plant.id, error: err.message });
        }
      }

      if (errors.length) {
        return { statusCode: 400, headers: headers(), body: JSON.stringify({ ok: false, error: 'Errore calcolo impianti', details: errors }) };
      }

      const totals = {
        energy_shared_kwh: results.reduce((sum, r) => sum + Number(r.energy_shared_kwh || 0), 0),
        per_member: aggregateCER(results.map(r => r.allocations))
      };

      return {
        statusCode: 200,
        headers: headers(),
        body: JSON.stringify({ ok: true, data: { results, totals } })
      };
    }

    return { statusCode: 405, headers: headers(), body: JSON.stringify({ ok: false, error: 'Metodo non supportato' }) };
  } catch (err) {
    return { statusCode: 500, headers: headers(), body: JSON.stringify({ ok: false, error: err.message || 'Errore server' }) };
  }
};
