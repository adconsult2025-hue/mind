#!/usr/bin/env node
'use strict';

const { Client } = require('pg');

const REQUIRED_TABLES = [
  'quotes',
  'quote_items',
  'cer',
  'cer_documents'
];

function formatStatus(ok, message) {
  const icon = ok ? '✅' : '❌';
  return `${icon} ${message}`;
}

function parseArgs() {
  const [, , connectionArg] = process.argv;
  const connectionString = connectionArg || process.env.NEON_DATABASE_URL;
  return { connectionString };
}

async function testConnection(connectionString) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name`
    );

    const tableNames = rows.map((row) => row.table_name);
    const missingTables = REQUIRED_TABLES.filter((table) => !tableNames.includes(table));

    const stats = {};
    for (const table of REQUIRED_TABLES) {
      if (!tableNames.includes(table)) continue;
      const { rows: countRows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      stats[table] = countRows[0]?.count ?? 0;
    }

    return { tableNames, missingTables, stats };
  } finally {
    await client.end();
  }
}

async function main() {
  const { connectionString } = parseArgs();
  if (!connectionString) {
    console.error(formatStatus(false, 'Variabile NEON_DATABASE_URL mancante.')); 
    console.error('Imposta NEON_DATABASE_URL o passa una connection string come argomento.');
    console.error('Esempio: node tools/check_database.js postgresql://user:pass@host/db');
    process.exitCode = 1;
    return;
  }

  console.log('🔍 Verifica connessione database...');
  try {
    const { tableNames, missingTables, stats } = await testConnection(connectionString);
    console.log(formatStatus(true, 'Connessione riuscita.'));
    console.log(`Tabelle rilevate (${tableNames.length}): ${tableNames.join(', ') || 'nessuna'}`);

    if (missingTables.length > 0) {
      console.log(formatStatus(false, `Tabelle mancanti: ${missingTables.join(', ')}`));
      process.exitCode = 1;
    } else {
      console.log(formatStatus(true, 'Tutte le tabelle richieste sono presenti.'));
    }

    for (const [table, count] of Object.entries(stats)) {
      console.log(`  - ${table}: ${count} record`);
    }
  } catch (error) {
    console.error(formatStatus(false, 'Errore durante il test di connessione.'));
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
