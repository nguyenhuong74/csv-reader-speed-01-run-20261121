// csv-reader-speed: a faster drop-in for make.fun's csv-reader 1.0.0.
//
// Same answers, byte for byte in JSON terms, on every input: the same
// {columns, rows, errors} the reference returns for {text, header}. The
// reference reads one character at a time and builds every field by
// concatenating one character at a time; this module reads the same way --
// one pass, left to right, same order of errors, same line counting -- but
// takes each field out of the text with slice() instead of rebuilding it,
// so a plain field costs one scan for its end and one slice, and a quoted
// field costs one indexOf('"') per quote run. No dependencies, no regex in
// the hot path, no allocation per character.
//
// Policy (csv-reader 1.0.0, kept exactly):
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote, and each CRLF or lone CR inside it is read as LF;
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when the field ends); a quote that never
//     closes is a literal character, and the text after it is read again as
//     unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings,
//     never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it (every record when header is false), each padded with ""
//     (short_row, with fields: its field count) or cut (long_row, with extra: the
//     cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a record's short_row or
//     long_row when it ends: line the 1-based line its record starts on, counting
//     every LF, CRLF and lone CR inside quotes, and row its record's index in
//     rows, null for the header.

// How a field ended: at a comma (the record goes on), at a line break or at
// the end of the text (the record ends).
const COMMA = 0;
const BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and how many characters
  // the unquoted read kept (a quoted field's own read keeps none itself).
  let fval = '';
  let fend = END;
  let fadd = 0;

  // The quoted field being built (its pieces live here so quoted() builds no
  // closures of its own per call).
  let qhead = '';
  let qparts = null;

  // Reads unquoted characters onto `init` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Sets fval/fend/fadd; `added`
  // counts the characters kept, so a caller can tell junk from nothing.
  function unquoted(init) {
    let head = init;
    let parts = null;
    let added = 0;
    for (;;) {
      let i = pos;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i++;
      }
      if (i > pos) {
        added += i - pos;
        const seg = text.slice(pos, i);
        if (parts !== null) parts.push(seg);
        else if (head === '') head = seg;
        else parts = [head, seg];
      }
      if (i >= n) {
        pos = n;
        fval = parts !== null ? parts.join('') : head;
        fend = END;
        fadd = added;
        return;
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        pos = i + 1;
        fval = parts !== null ? parts.join('') : head;
        fend = COMMA;
        fadd = added;
        return;
      }
      if (c === 10) {
        pos = i + 1;
        line += 1;
        fval = parts !== null ? parts.join('') : head;
        fend = BREAK;
        fadd = added;
        return;
      }
      // A CR: a line break with the LF that follows it, else a stray CR, dropped.
      if (text.charCodeAt(i + 1) === 10) {
        pos = i + 2;
        line += 1;
        fval = parts !== null ? parts.join('') : head;
        fend = BREAK;
        fadd = added;
        return;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = i + 1;
    }
  }

  // Counts the LF characters in text[a..b).
  function countNl(a, b) {
    let c = 0;
    let i = a;
    for (;;) {
      const j = text.indexOf('\n', i);
      if (j === -1 || j >= b) return c;
      c++;
      i = j + 1;
    }
  }

  // Appends one already-converted string piece to the quoted field being built.
  function addSeg(seg) {
    if (seg === '') return;
    if (qparts !== null) qparts.push(seg);
    else if (qhead === '') qhead = seg;
    else qparts = [qhead, seg];
  }

  // Appends the raw chunk text[a..b), converting each CRLF or lone CR in it
  // to one LF and counting every line break it holds.
  function addChunk(a, b) {
    if (a >= b) return;
    const nl = text.indexOf('\n', a);
    const cr = text.indexOf('\r', a);
    if ((nl === -1 || nl >= b) && (cr === -1 || cr >= b)) {
      addSeg(text.slice(a, b));
      return;
    }
    if (cr === -1 || cr >= b) {
      // LF only: kept as they stand, one line each.
      line += countNl(a, b);
      addSeg(text.slice(a, b));
      return;
    }
    // A CR is in the chunk: walk it, turning each CRLF or lone CR into LF.
    let s = a;
    for (;;) {
      const r = text.indexOf('\r', s);
      if (r === -1 || r >= b) {
        line += countNl(s, b);
        addSeg(text.slice(s, b));
        return;
      }
      line += countNl(s, r);
      addSeg(text.slice(s, r));
      addSeg('\n');
      line += 1;
      s = text.charCodeAt(r + 1) === 10 ? r + 2 : r + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fval/fend/fadd
  // like unquoted does. A chunk between two quotes (or between the opening
  // quote and the closing one) is taken as one slice when it holds no line
  // break; a chunk holding line breaks is counted the same way the reference
  // counts them and any CR in it is read as LF.
  function quoted() {
    const open = pos;
    const openLine = line;
    qhead = '';
    qparts = null;
    let cur = pos + 1;
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as an unquoted field.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        unquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the field goes on.
        addChunk(cur, q);
        addSeg('"');
        cur = q + 2;
        continue;
      }
      // The closing quote.
      addChunk(cur, q);
      const value = qparts !== null ? qparts.join('') : qhead;
      pos = q + 1;
      if (pos >= n) {
        fval = value;
        fend = END;
        fadd = 0;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fval = value;
        fend = COMMA;
        fadd = 0;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fval = value;
        fend = BREAK;
        fadd = 0;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fval = value;
        fend = BREAK;
        fadd = 0;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      unquoted(value);
      if (fadd > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let q = false; // whether the last field read was quoted
    do {
      if (text.charCodeAt(pos) === 34) {
        quoted();
        q = true;
      } else {
        unquoted('');
        q = false;
      }
      fields.push(fval);
    } while (fend === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !q) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
