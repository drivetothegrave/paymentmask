const RU_LETTERS = 'АВЕКМНОРСТУХ';
const LAT_TO_CYR = { A:'А', B:'В', E:'Е', K:'К', M:'М', H:'Н', O:'О', P:'Р', C:'С', T:'Т', Y:'У', X:'Х', Ё:'Е' };
const CYR_TO_LAT = { А:'A', В:'B', Е:'E', К:'K', М:'M', Н:'H', О:'O', Р:'P', С:'C', Т:'T', У:'Y', Х:'X', Ё:'E' };
const RU_PATTERN = 'LDDDLLDDD';
const RU_SPACES_AFTER = [1, 4, 6];

// Пытаемся прочитать ввод как начало российского номера. Не подходит — null.
function toRuPrefix(raw) {
  const chars = raw.toUpperCase().replace(/\s*RUS$/, '').replace(/[\s-]/g, '');
  if (chars.length > RU_PATTERN.length) return null;
  let out = '';
  for (let ch of chars) {
    ch = LAT_TO_CYR[ch] || ch;
    const need = RU_PATTERN[out.length];
    const ok = need === 'L' ? RU_LETTERS.includes(ch) : /\d/.test(ch);
    if (!ok) return null;
    out += ch;
  }
  return out;
}

function formatRu(c) {
  let out = '';
  for (let i = 0; i < c.length; i++) {
    out += c[i];
    if (RU_SPACES_AFTER.includes(i + 1) && i + 1 < c.length) out += ' ';
  }
  return out;
}

function cleanForeign(raw) {
  return raw.toUpperCase()
    .replace(/[А-ЯЁ]/g, ch => CYR_TO_LAT[ch] ?? '')
    .replace(/[^A-Z0-9 -]/g, '')
    .replace(/([ -])[ -]+/g, '$1')
    .replace(/^[ -]/, '')
    .slice(0, 14);
}

// Главная функция: строка из поля → что показать и что отправить
function parsePlate(raw) {
  const ru = toRuPrefix(raw);
  if (ru !== null) {
    const valid = /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/.test(ru) && ru.slice(1, 4) !== '000';
    return { type: 'ru', display: formatRu(ru), value: ru, valid };
  }
  const display = cleanForeign(raw);
  const value = display.replace(/[\s-]/g, '');
  const valid = value.length >= 2 && value.length <= 12 && /\d/.test(value);
  return { type: 'foreign', display, value, valid };
}

function attachPlateMask(input, onChange) {
  let type = 'ru';

  input.addEventListener('keydown', e => {
    // В режиме РФ пробелы ставит маска: Backspace после пробела стирает символ перед ним
    const p = input.selectionStart;
    if (type === 'ru' && e.key === 'Backspace' && p === input.selectionEnd &&
        p > 0 && input.value[p - 1] === ' ') {
      input.setSelectionRange(p - 1, p - 1);
    }
  });

  input.addEventListener('input', () => {
    const significant = s => s.replace(/[^0-9A-ZА-ЯЁa-zа-яё]/g, '').length;
    const before = significant(input.value.slice(0, input.selectionStart));

    const res = parsePlate(input.value);
    type = res.type;
    input.value = res.display;

    let pos = 0, n = 0;
    while (pos < res.display.length && n < before) {
      if (/[0-9A-ZА-Я]/.test(res.display[pos])) n++;
      pos++;
    }
    input.setSelectionRange(pos, pos);

    onChange?.(res); // { type: 'ru' | 'foreign', display, value, valid }
  });
}

if (typeof module !== 'undefined') module.exports = { parsePlate };
