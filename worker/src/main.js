#!/usr/bin/env node
// Robot de capture : traite toutes les pages en attente, puis s'arrête.
// Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { capturePage } from './capture-page.js';
import { processPage } from './process-page.js';

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis');
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const browser = await chromium.launch();

  const deps = {
    capture: (url) => capturePage(browser, url),
    upload: async (path, buffer) => {
      const { error } = await db.storage.from('thumbnails').upload(path, buffer, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
    },
    update: async (id, fields) => {
      const { error } = await db.from('pages').update(fields).eq('id', id);
      if (error) throw error;
    },
  };

  try {
    for (;;) {
      const { data: rows, error } = await db.rpc('claim_pending_pages');
      if (error) throw error;
      if (!rows.length) break;
      for (const row of rows) {
        process.stdout.write(`→ ${row.url} … `);
        console.log(await processPage(row, deps));
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
