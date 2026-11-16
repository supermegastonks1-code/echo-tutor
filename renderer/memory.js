// Страховка памяти. Голосовая модель во время разговора часто забывает вызвать remember,
// поэтому после занятия (и каждые несколько реплик) обычная текстовая модель Gemini
// перечитывает разговор и достаёт из него новые слова, ошибки и факты об ученике.

const API = 'https://generativelanguage.googleapis.com/v1beta';

let modelsCache = null;

// Текстовые «flash»-модели от новых к старым. Если одна перегружена — берём следующую.
async function textModels(apiKey) {
  if (modelsCache) return modelsCache;
  const res = await fetch(`${API}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`список моделей: ${res.status}`);
  const { models = [] } = await res.json();
  const ok = models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent')
    && /^models\/gemini-([\d.]+-)?flash/.test(m.name)
    && !/live|audio|tts|image|thinking|exp|omni/.test(m.name));
  if (!ok.length) throw new Error('нет подходящей текстовой модели');
  const ver = (m) => parseFloat(m.name.match(/gemini-([\d.]+)/)?.[1] || '0');
  const plain = (m) => (/lite/.test(m.name) ? 0 : 2) + (/preview/.test(m.name) ? 0 : 1);
  ok.sort((a, b) => ver(b) - ver(a) || plain(b) - plain(a));
  modelsCache = ok.map(m => m.name).slice(0, 5);
  return modelsCache;
}

async function generate(apiKey, model, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${API}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`${model}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    new_words: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { en: { type: 'STRING' }, ru: { type: 'STRING' } }, required: ['en', 'ru'] }
    },
    mistakes: { type: 'ARRAY', items: { type: 'STRING' } },
    notes: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['new_words', 'mistakes', 'notes']
};

// turns: [{ role: 'me' | 'tutor', text }]; known: что уже есть в памяти, чтобы не дублировать.
export async function digestTurns(apiKey, turns, known) {
  const dialog = turns.map(t => `${t.role === 'me' ? 'Ученик' : 'Репетитор'}: ${t.text}`).join('\n');
  if (!dialog.trim()) return { new_words: [], mistakes: [], notes: [] };
  const prompt = `Ты помогаешь репетитору английского вести память об ученике. Ученик русскоязычный.
Ниже кусок занятия (реплики ученика распознаны из речи и могут содержать ошибки распознавания).

Достань из него:
- new_words — английские слова и фразы, которые репетитор дал, перевёл или объяснил ученику (en — по-английски, ru — перевод). Не включай самые базовые слова (I, you, is, the) и слова, которые уже есть в памяти.
- mistakes — настоящие ошибки ученика в английском, в формате «что сказал ученик → как правильно». Только то, в чём уверен; обрывки и мусор распознавания не считай ошибками.
- notes — новые факты об ученике: имя, возраст, работа, учёба, хобби, планы, предпочтения в учёбе. Коротко, по-русски. Не повторяй уже известное.
Если ничего нет — верни пустые списки.

Уже в памяти:
- слова: ${known.words.join(', ') || 'нет'}
- факты: ${known.notes.join('; ') || 'нет'}

Занятие:
${dialog}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 }
  };
  let data, model, lastError;
  for (model of await textModels(apiKey)) {
    try { data = await generate(apiKey, model, body); break; } catch (e) { lastError = e; }
  }
  if (!data) throw lastError;
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
  const out = JSON.parse(text);
  return {
    new_words: Array.isArray(out.new_words) ? out.new_words : [],
    mistakes: Array.isArray(out.mistakes) ? out.mistakes : [],
    notes: Array.isArray(out.notes) ? out.notes : [],
    model
  };
}
