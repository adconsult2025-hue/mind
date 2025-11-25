import { q } from './_db.js';

export const handler = async () => {
  try {
    const started = Date.now();
    const v = await q('select version() as v, now() as ts');
    const ms = Date.now() - started;
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ms, version: v.rows?.[0]?.v, ts: v.rows?.[0]?.ts })
    };
  } catch (e) {
    console.error('[db-ping] ERROR', e);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e.message }) };
  }
};
