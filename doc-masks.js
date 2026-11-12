/**
 * Маски и валидация полей российских документов.
 *
 * Как устроено:
 *  - у каждого документа есть один или несколько вариантов разбора (variants);
 *    вариант — это список сегментов (тип символов, min/max длина, разделитель перед сегментом);
 *  - ввод разбирается первым вариантом, под который он подходит целиком;
 *    последний вариант работает «мягко»: неподходящие символы просто выкидываются;
 *  - в поле показывается отформатированное значение (с пробелами/дефисами),
 *    на бэкенд уходит value — без разделителей, оно проходит исходные регулярки;
 *  - ошибка = пусто / не прошла регулярка / не прошла доп. проверка (СНИЛС, римские цифры).
 */
(function (root) {
  // Латинские буквы, похожие на кириллические
  const LAT2CYR = { A:'А', B:'В', E:'Е', K:'К', M:'М', H:'Н', O:'О', P:'Р', C:'С', T:'Т', Y:'У', X:'Х' };
  // Кириллица, похожая на римские цифры (если пользователь не переключил раскладку)
  const CYR2ROMAN = { 'Х':'X', 'С':'C' };

  // Каждый тип: (символ, текущее содержимое сегмента) → нормализованный символ или null
  const CHARSETS = {
    digit:      ch => /\d/.test(ch) ? ch : null,
    roman:      (ch, cur) => {
      let u = ch.toUpperCase();
      if (!cur && CYR2ROMAN[u]) u = CYR2ROMAN[u];   // только в начале, дальше Х/С — уже буквы серии
      return 'IVXLC'.includes(u) ? u : null;
    },
    cyr:        ch => { let u = ch.toUpperCase(); u = LAT2CYR[u] || u; return /[А-Я]/.test(u) ? u : null; },
    cyrDigit:   ch => { let u = ch.toUpperCase(); u = LAT2CYR[u] || u; return /[А-Я0-9]/.test(u) ? u : null; },
    letter:     ch => { const u = ch.toUpperCase(); return /[A-ZА-Я]/.test(u) ? u : null; },
    alnum:      ch => { const u = ch.toUpperCase(); return /[A-ZА-Я0-9]/.test(u) ? u : null; },
  };

  const SEPARATORS = /[\s\-–—№#./\\]/g;   // всё, что пользователь мог вставить «для красоты»

  const ROMAN_RE = /^C{0,3}(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

  function snilsChecksumOk(v) {
    const body = v.slice(0, 9);
    if (+body <= 1001998) return true;            // для старых номеров контрольное число не считается
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += +body[i] * (9 - i);
    let c = sum < 100 ? sum : (sum === 100 || sum === 101) ? 0 : sum % 101;
    if (c === 100) c = 0;
    return c === +v.slice(9);
  }

  // Сокращения для сегментов
  const S = (type, min, max = min, sep = '') => ({ type, min, max, sep });

  // Повторяющиеся описания
  const SERIES2_NUM7 = { // [A-ZА-Я]{2}\d{7}
    placeholder: 'АА 0000000',
    variants: [[S('letter', 2), S('digit', 7, 7, ' ')]],
    regex: /^[A-ZА-Я]{2}\d{7}$/,
  };
  // Нули в плейсхолдере — только для цифр. Где можно и буквы, и цифры, пишем длину:
  // «19 символов», «От 4 до 14 символов»
  const ALNUM = (min, max, placeholder = min === max ? `${min} символов` : `От ${min} до ${max} символов`) => ({
    placeholder,
    variants: [[S('alnum', min, max)]],
    regex: new RegExp(`^[A-Za-zА-Яа-я0-9]{${min},${max}}$`),
  });
  const DIGITS = (n, placeholder = '0'.repeat(n), variants = [[S('digit', n)]]) => ({
    placeholder, variants,
    regex: new RegExp(`^\\d{${n}}$`),
  });
  const ROMAN_SERIES = (maxRoman) => ({
    placeholder: 'IV-АА 000000',
    variants: [[S('roman', 1, maxRoman), S('cyr', 2, 2, '-'), S('digit', 6, 6, ' ')]],
    regex: new RegExp(`^[IVXLC]{1,${maxRoman}}[А-Я]{2}\\d{6}$`),
    check: v => ROMAN_RE.test(v.match(/^[IVXLC]+/)[0]) ? null
              : 'Римская часть серии записана неверно',
  });

  const DOCUMENTS = [
    { code: '01', name: 'Паспорт гражданина РФ',
      placeholder: '0000 000000',
      variants: [[S('digit', 4), S('digit', 6, 6, ' ')]],
      regex: /^\d{10}$/ },

    { code: '02', name: 'Свидетельство о рождении', ...ROMAN_SERIES(4) },
    { code: '03', name: 'Паспорт моряка', ...SERIES2_NUM7 },
    { code: '04', name: 'Удостоверение личности военнослужащего', ...SERIES2_NUM7 },
    { code: '05', name: 'Военный билет', ...SERIES2_NUM7 },
    { code: '06', name: 'Временное удостоверение личности гражданина РФ', ...ALNUM(19, 19) },
    { code: '07', name: 'Справка об освобождении из мест лишения свободы', checkName: 'справку об освобождении из мест лишения свободы', ...ALNUM(19, 19) },
    { code: '08', name: 'Паспорт иностранного гражданина', ...ALNUM(4, 19) },
    { code: '09', name: 'Вид на жительство', ...ALNUM(4, 14) },
    { code: '10', name: 'Разрешение на временное проживание', ...DIGITS(9) },

    { code: '11', name: 'Удостоверение беженца',
      placeholder: 'АА 0000000',
      variants: [[S('cyrDigit', 2), S('digit', 7, 7, ' ')]],
      regex: /^[А-Я0-9]{2}\d{7}$/ },

    { code: '12', name: 'Миграционная карта', checkName: 'миграционную карту',
      placeholder: 'От 9 до 12 цифр',
      variants: [[S('digit', 9, 12)]],
      regex: /^\d{9,12}$/ },

    { code: '13', name: 'Паспорт гражданина СССР', ...ROMAN_SERIES(6) },

    { code: '14', name: 'СНИЛС',
      placeholder: '000-000-000 00',
      variants: [[S('digit', 3), S('digit', 3, 3, '-'), S('digit', 3, 3, '-'), S('digit', 2, 2, ' ')]],
      regex: /^\d{11}$/,
      check: v => snilsChecksumOk(v) ? null : 'Проверьте СНИЛС — не сходится контрольное число' },

    { code: '22', name: 'Водительское удостоверение',
      placeholder: '00 00 000000',   // позиции 3–4 допускают и буквы, но в современных ВУ там цифры
      variants: [
        [S('digit', 2), S('alnum', 2, 2, ' '), S('digit', 6, 6, ' ')],   // российское: 00 00 000000 (в старых бланках 00 АА 000000)
        [S('alnum', 6, 32)],                                             // иностранное / прочее
      ],
      regex: /^(?:\d{2}[A-Za-zА-Яа-я0-9]{2}\d{6}|0{0,13}[A-Za-zА-Яа-я0-9]{6,19})$/ },

    { code: '24', name: 'Свидетельство о регистрации ТС (СТС)',
      placeholder: '00 00 000000',   // позиции 3–4 допускают и буквы (старые бланки), но в новых там цифры
      variants: [
        [S('digit', 2), S('alnum', 2, 2, ' '), S('digit', 6, 6, ' ')],   // обычное: 00 00 000000 (в старых бланках 00 АА 000000)
        [S('alnum', 6, 12)],
      ],
      regex: /^[A-ZА-Я0-9]{1,4}\d{5,8}$/ },

    { code: '25', name: 'Охотничий билет',
      placeholder: '00 000000',   // серия билета единого образца — код региона цифрами; буквы регулярка тоже допускает
      variants: [[S('cyrDigit', 2), S('digit', 6, 6, ' ')]],
      regex: /^[А-Я0-9]{2}\d{6}$/ },

    { code: '26', name: 'Разрешение на хранение и ношение охотничьего оружия', ...DIGITS(8) },
    { code: '28', name: 'Заграничный паспорт гражданина РФ',
      ...DIGITS(9, '00 0000000', [[S('digit', 2), S('digit', 7, 7, ' ')]]) },
    { code: '29', name: 'Свидетельство о временном убежище', ...SERIES2_NUM7 },
    { code: '30', name: 'Свидетельство о рассмотрении ходатайства по существу', ...DIGITS(9) },
  ];

  /* ---------- движок ---------- */

  // Разбор по сегментам. strict=true — вернуть null, если хоть один символ не влез.
  function parseSegments(chars, segments, strict) {
    const parts = segments.map(() => '');
    let i = 0;
    for (const raw of chars) {
      let placed = false;
      while (i < segments.length) {
        const seg = segments[i];
        const ch = parts[i].length < seg.max ? CHARSETS[seg.type](raw, parts[i]) : null;
        if (ch !== null) { parts[i] += ch; placed = true; break; }
        const next = segments[i + 1];
        if (next && parts[i].length >= seg.min && CHARSETS[next.type](raw, '') !== null) { i++; continue; }
        break;
      }
      if (!placed && strict) return null;
    }
    return parts;
  }

  function formatParts(parts, segments) {
    return parts.reduce((out, p, i) => out + (p && i > 0 && out ? segments[i].sep : '') + p, '');
  }

  function parse(doc, raw) {
    const chars = [...raw.replace(SEPARATORS, '')];
    const vs = doc.variants;
    for (let k = 0; k < vs.length; k++) {
      const parts = parseSegments(chars, vs[k], k < vs.length - 1);
      if (parts) return { display: formatParts(parts, vs[k]), value: parts.join(''), variant: k };
    }
  }

  // «Паспорт гражданина РФ» → «паспорт гражданина РФ», аббревиатуры (СНИЛС) не трогаем
  function checkName(doc) {
    if (doc.checkName) return doc.checkName;
    const n = doc.name;
    return /^[A-ZА-ЯЁ]{2}/.test(n) ? n : n[0].toLowerCase() + n.slice(1);
  }

  function validate(doc, value) {
    if (!value) return 'Укажите ' + checkName(doc);   // показывается только по кнопке «Отправить»
    if (!doc.regex.test(value)) return 'Проверьте ' + checkName(doc);
    return doc.check ? doc.check(value) : null;
  }

  /**
   * Подключить маску к input.
   * onChange({ display, value, valid, empty, error }) — на каждое изменение.
 * Правило показа ошибок: на blur — только если поле НЕ пустое и невалидно;
 * по кнопке «Отправить» — любая ошибка, включая «Укажите {документ}».
   * Возвращает { setDoc(code), refresh(), getState() }.
   */
  function attachDocMask(input, code, onChange) {
    let doc = getDoc(code);
    let state = { display: '', value: '', valid: false, empty: true, error: validate(doc, '') };
    const isSep = ch => ch === ' ' || ch === '-';

    input.addEventListener('keydown', e => {
      const p = input.selectionStart;
      if (e.key === 'Backspace' && p === input.selectionEnd && p > 0 && isSep(input.value[p - 1])) {
        input.setSelectionRange(p - 1, p - 1);
      }
    });

    function apply(keepCaret) {
      const sig = s => [...s].filter(ch => !isSep(ch)).length;
      const before = keepCaret ? sig(input.value.slice(0, input.selectionStart)) : Infinity;
      const res = parse(doc, input.value);
      input.value = res.display;
      if (keepCaret) {
        let pos = 0, n = 0;
        while (pos < res.display.length && n < before) { if (!isSep(res.display[pos])) n++; pos++; }
        input.setSelectionRange(pos, pos);
      }
      const error = validate(doc, res.value);
      // empty: поле пустое — на blur не ругаемся, «Укажите {документ}» показываем только по кнопке «Отправить»
      state = { display: res.display, value: res.value, valid: !error, empty: !res.value, error };
      onChange && onChange(state, doc);
    }

    input.addEventListener('input', () => apply(true));
    input.placeholder = doc.placeholder;

    return {
      setDoc(newCode) { doc = getDoc(newCode); input.placeholder = doc.placeholder; apply(false); },
      refresh() { apply(false); },
      getState: () => state,
    };
  }

  function getDoc(code) {
    const d = DOCUMENTS.find(d => d.code === code);
    if (!d) throw new Error('Неизвестный код документа: ' + code);
    return d;
  }

  const api = { DOCUMENTS, getDoc, parse, validate, attachDocMask };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DocMasks = api;
})(typeof window !== 'undefined' ? window : globalThis);
