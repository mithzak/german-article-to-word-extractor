/* app.js - German Word Extractor */
(() => {
  const input = document.getElementById('inputText');
  const output = document.getElementById('outputText');
  const extractBtn = document.getElementById('extractBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const clearBtn = document.getElementById('clearBtn');
  const meta = document.getElementById('meta');

  // Articles to combine with the following word (lowercased)
  const ARTICLES = new Set(['der','die','das']);

  // Extract words using Unicode-aware regex (letters + combining marks + hyphens and apostrophes)
  const wordRegex = /\p{L}[\p{L}\p{Mn}\-']*/gu;

  // Returns array of { article: '', noun: 'word', display: 'word' }
  function extractStructuredWords(text) {
    if (!text) return [];
    const matches = Array.from(text.matchAll(wordRegex), m => m[0]);
    const items = [];
    for (let i = 0; i < matches.length; i++) {
      const w = matches[i].toLowerCase();
      if (ARTICLES.has(w) && i + 1 < matches.length) {
        const next = matches[i + 1].toLowerCase();
        items.push({ article: w, noun: next, display: w + ' ' + next });
        i++; // skip next
      } else {
        items.push({ article: '', noun: w, display: w });
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

  function updateUI(structured) {
    const displayList = structured.map(s => s.display);
    output.value = displayList.join(', ');
    meta.textContent = `${structured.length} unique word${structured.length === 1 ? '' : 's'}`;
    downloadCsvBtn.disabled = structured.length === 0;
    copyBtn.disabled = structured.length === 0;
    copyExcelBtn.disabled = structured.length === 0;
  }

  extractBtn.addEventListener('click', () => {
    const txt = input.value;
    const structured = extractStructuredWords(txt);
    updateUI(structured);
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
  // ""\tGermanNoun\tArticle\t"\n" per entry (English and ExampleSentence blank)
  const copyExcelBtn = document.getElementById('copyExcelBtn');
  copyExcelBtn.addEventListener('click', async () => {
    const structured = extractStructuredWords(input.value);
    if (!structured.length) return;
    const lines = structured.map(it => {
      // columns: English(blank), GermanNoun, Article, ExampleSentence(blank)
      return ['','' + it.noun, it.article || '', ''].join('\t');
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

  downloadCsvBtn.addEventListener('click', () => {
    const structured = extractStructuredWords(input.value);
    if (structured.length === 0) return;
    // CSV with columns: English, GermanNoun, Article, ExampleSentence
    const header = ['English','GermanNoun','Article','ExampleSentence'];
    const rows = structured.map(it => [ '', it.noun, it.article || '', '' ]);
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
  });

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