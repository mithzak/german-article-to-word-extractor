/* app.js - German Word Extractor */
(() => {
  const input = document.getElementById('inputText');
  const output = document.getElementById('outputText');
  const extractBtn = document.getElementById('extractBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const clearBtn = document.getElementById('clearBtn');
  const meta = document.getElementById('meta');
  const translateBtn = document.getElementById('translateBtn');
  const statusEl = document.getElementById('status');

  // Articles/determiners to combine with the following word (lowercased)
  const ARTICLES = new Set([
    'der','die','das','den','dem','des',
    'ein','eine','einen','einem','einer','eines',
    'kein','keine','keinen','keinem','keiner','keines'
  ]);

  // Extract words using Unicode-aware regex (letters + combining marks + hyphens and apostrophes)
  const wordRegex = /\p{L}[\p{L}\p{Mn}\-']*/gu;

  // Returns array of { article: '', noun: 'word', display: 'word', english: '' }
  // Does not mutate global state; call extract() to update `currentStructured`.
  function extractStructuredWords(text) {
    if (!text) return [];
    const matches = Array.from(text.matchAll(wordRegex), m => m[0]);
    const items = [];
    for (let i = 0; i < matches.length; i++) {
      const w = matches[i].toLowerCase();
      if (ARTICLES.has(w) && i + 1 < matches.length) {
        const next = matches[i + 1].toLowerCase();
        items.push({ article: w, noun: next, display: w + ' ' + next, english: '' });
        i++; // skip next
      } else {
        items.push({ article: '', noun: w, display: w, english: '' });
      }
    }

    // Deduplicate while preserving order — key is "article + ' ' + noun" (article may be empty)
    const seen = new Set();
    const unique = [];
    for (const it of items) {
      const key = (it.article ? it.article + ' ' : '') + it.noun;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(it);
      }
    }
    return unique;
  }

  // currentStructured holds the latest extracted list (with any translations applied)
  let currentStructured = [];

  // Helper to run extract and set global state
  function extract() {
    const txt = input.value;
    currentStructured = extractStructuredWords(txt);
    updateUI(currentStructured);
  }

  function showStatus(message, type = 'info', autoClear = true) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'status ' + (type || 'info');
    if (autoClear) {
      clearTimeout(showStatus._t);
      showStatus._t = setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'status';
      }, 6000);
    }
  }

  function updateUI(structured) {
    const displayList = structured.map(s => s.display + (s.english ? ` — ${s.english}` : ''));
    output.value = displayList.join(', ');
    const transCount = structured.filter(s => s.english).length;
    meta.textContent = `${structured.length} unique word${structured.length === 1 ? '' : 's'} — ${transCount} translated`;
    downloadCsvBtn.disabled = structured.length === 0;
    copyBtn.disabled = structured.length === 0;
    copyExcelBtn.disabled = structured.length === 0;
    translateBtn.disabled = structured.length === 0;
  }

  extractBtn.addEventListener('click', () => {
    extract();
  });

  // Translate using MyMemory free API. Caches translations per noun.
  const translationCache = new Map();

  async function translateNoun(noun) {
    if (!noun) return '';
    if (translationCache.has(noun)) return translationCache.get(noun);
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(noun)}&langpair=de|en`;
    // simple retry mechanism with up to 2 attempts
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network ' + res.status);
        const data = await res.json();
        // Primary: responseData.translatedText, fallback to matches
        let translated = '';
        if (data && data.responseData && data.responseData.translatedText) {
          translated = data.responseData.translatedText;
        } else if (data && data.matches && data.matches.length) {
          translated = data.matches[0].translation || '';
        }
        translated = translated.trim();
        translationCache.set(noun, translated);
        return translated;
      } catch (err) {
        if (attempt === maxAttempts) {
          translationCache.set(noun, '');
          showStatus(`Translation failed for "${noun}" (${err.message}).`, 'error');
          return '';
        }
        // brief backoff before retry
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }
  }

  translateBtn.addEventListener('click', async () => {
    translateBtn.disabled = true;
    // ensure we operate on the latest structured array
    if (!currentStructured || currentStructured.length === 0) extract();
    if (currentStructured.length === 0) {
      translateBtn.disabled = false;
      return;
    }
    // Build set of unique nouns to translate (reduce API calls)
    const nouns = Array.from(new Set(currentStructured.map(s => s.noun)));
    // Translate sequentially in small batches to be gentle on API
    for (let i = 0; i < nouns.length; i++) {
      const n = nouns[i];
      showStatus(`Translating ${i + 1}/${nouns.length}: ${n}`, 'info', false);
      const eng = await translateNoun(n);
      // map back to currentStructured items
      for (const item of currentStructured) {
        if (item.noun === n) item.english = eng;
      }
      updateUI(currentStructured);
    }
    showStatus('Translation complete', 'success');
    translateBtn.disabled = false;
  });

  copyBtn.addEventListener('click', async () => {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      copyBtn.textContent = 'Copied';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
    } catch (e) {
      alert('Copy failed — please select and copy manually.');
    }
  });

  // Copy rows formatted for Excel (tab-separated, no header):
  // English	GermanNoun	Article	ExampleSentence per entry
  const copyExcelBtn = document.getElementById('copyExcelBtn');
  copyExcelBtn.addEventListener('click', async () => {
    if ((!currentStructured || currentStructured.length === 0) && input.value) extract();
    const structured = currentStructured || [];
    if (!structured.length) return;
    const lines = structured.map(it => {
      // columns: English, GermanNoun, Article, ExampleSentence(blank)
      return [it.english || '', it.noun, it.article || '', ''].join('\t');
    });
    const tsv = lines.join('\n');
    try {
      await navigator.clipboard.writeText(tsv);
      copyExcelBtn.textContent = 'Copied';
      setTimeout(() => (copyExcelBtn.textContent = 'Copy for Excel'), 1200);
    } catch (e) {
      alert('Copy for Excel failed — please select and copy manually.');
    }
  });

  downloadCsvBtn.addEventListener('click', async () => {
    // ensure we have extracted data
    if ((!currentStructured || currentStructured.length === 0) && input.value) extract();
    const structured = currentStructured || [];
    if (structured.length === 0) return;
    // If translations missing, attempt to translate them now before download
    const missing = structured.filter(s => !s.english);
    const nounsToTranslate = Array.from(new Set(missing.map(s => s.noun)));
    if (nounsToTranslate.length > 0) {
      showStatus(`Translating ${nounsToTranslate.length} missing entries before download...`, 'info', false);
      for (let i = 0; i < nounsToTranslate.length; i++) {
        const n = nounsToTranslate[i];
        showStatus(`Translating ${i + 1}/${nounsToTranslate.length}: ${n}`, 'info', false);
        const eng = await translateNoun(n);
        for (const item of currentStructured) {
          if (item.noun === n) item.english = eng;
        }
        updateUI(currentStructured);
      }
      showStatus('All missing translations attempted', 'info');
    }
    doDownload(currentStructured);
  });

  function doDownload(structuredFinal) {
    // CSV with columns: English, GermanNoun, Article, ExampleSentence
    const header = ['English','GermanNoun','Article','ExampleSentence'];
    const rows = structuredFinal.map(it => [ it.english || '', it.noun, it.article || '', '' ]);
    const all = [header, ...rows];
    const csv = all.map(cols => cols.map(s => {
      const str = String(s);
      const escaped = str.replace(/"/g, '""');
      return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'words.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showStatus('CSV download ready', 'success');
  }

  clearBtn.addEventListener('click', () => {
    input.value = '';
    output.value = '';
    meta.textContent = '';
    downloadCsvBtn.disabled = true;
    copyBtn.disabled = true;
    copyExcelBtn.disabled = true;
  });

  // initialize disabled state
  downloadCsvBtn.disabled = true;
  copyBtn.disabled = true;
  copyExcelBtn.disabled = true;
})();