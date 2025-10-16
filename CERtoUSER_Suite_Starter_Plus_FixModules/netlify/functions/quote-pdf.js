const { guard } = require('./_safe');
const { corsHeaders } = require('./_cors');
const { getQuote } = require('./_quotes');

const baseHeaders = {
  ...corsHeaders,
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
};

function parseId(event) {
  const patterns = [/\/api\/quote-pdf\/([^/?#]+)/, /\/\.netlify\/functions\/quote-pdf\/([^/?#]+)/];
  const sources = [event.path, event.rawUrl];
  for (const source of sources) {
    if (!source) continue;
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match) return decodeURIComponent(match[1]);
    }
  }
  const params = event.queryStringParameters || {};
  return params.id || params.quote_id || null;
}

function sanitizePdfText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function formatCurrency(amount, currency = 'EUR') {
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2
    }).format(Number(amount));
  } catch (error) {
    const value = Number.isFinite(Number(amount)) ? Number(amount).toFixed(2) : '0.00';
    return `${currency} ${value}`;
  }
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('it-IT');
}

function wrapText(text, maxLength = 90) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const tentative = current ? `${current} ${word}` : word;
    if (tentative.length <= maxLength) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function buildPdfStream(quote) {
  const lines = [];
  const number = quote.number || quote.code || quote.id;
  lines.push(`Preventivo ${number}`);
  if (quote.title) lines.push(`Oggetto: ${quote.title}`);
  if (quote.client?.name) lines.push(`Cliente: ${quote.client.name}`);
  if (quote.client?.company) lines.push(`Organizzazione: ${quote.client.company}`);
  if (quote.client?.address) lines.push(`Indirizzo: ${quote.client.address}`);
  const total = quote.totals?.totale ?? quote.totals?.total;
  lines.push(`Totale offerta: ${formatCurrency(total, quote.totals?.currency)}`);
  if (quote.status) lines.push(`Stato: ${quote.status}`);
  const updated = formatDate(quote.updated_at || quote.created_at);
  if (updated) lines.push(`Aggiornato: ${updated}`);
  const due = formatDate(quote.valid_until || quote.context?.due);
  if (due) lines.push(`Valido fino al: ${due}`);
  const summary = quote.summary || quote.context?.note;
  if (summary) {
    lines.push(...wrapText(`Sintesi: ${summary}`));
  }

  const operations = ['BT', '/F1 20 Tf', '72 780 Td', `(${sanitizePdfText(lines.shift() || '')}) Tj`, '/F1 12 Tf'];
  let first = true;
  lines.forEach((line) => {
    if (first) {
      operations.push('0 -30 Td');
      first = false;
    } else {
      operations.push('0 -18 Td');
    }
    operations.push(`(${sanitizePdfText(line)}) Tj`);
  });
  operations.push('ET');
  const content = operations.join('\n');
  return `${content}\n`;
}

function createPdf(quote) {
  const stream = buildPdfStream(quote);
  const streamLength = Buffer.byteLength(stream, 'utf8');

  const header = '%PDF-1.4\n';
  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n');
  objects.push(`4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}endstream\nendobj\n`);
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /Name /F1 /BaseFont /Helvetica >>\nendobj\n');

  const xrefEntries = ['0000000000 65535 f '];
  let offset = Buffer.byteLength(header, 'utf8');
  objects.forEach((obj) => {
    xrefEntries.push(`${String(offset).padStart(10, '0')} 00000 n `);
    offset += Buffer.byteLength(obj, 'utf8');
  });

  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n${xrefEntries.join('\n')}\n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const pdf = header + objects.join('') + xref + trailer + '\n';
  return Buffer.from(pdf, 'utf8');
}

exports.handler = guard(async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: baseHeaders, body: '' };
  }

  const id = parseId(event);
  if (!id) {
    return {
      statusCode: 400,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: { code: 'BAD_REQUEST', message: 'ID preventivo mancante' } })
    };
  }

  const quote = await getQuote(id);
  if (!quote) {
    return {
      statusCode: 404,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Preventivo non trovato' } })
    };
  }

  const buffer = createPdf(quote);
  return {
    statusCode: 200,
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${id}.pdf"`
    },
    body: buffer.toString('base64'),
    isBase64Encoded: true
  };
});
