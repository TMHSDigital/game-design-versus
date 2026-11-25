// A small Markdown renderer for the briefs the engine writes: headings, paragraphs, blockquotes, lists, tables
// and bold. Everything is HTML-escaped first, so engine text can never inject markup.

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const inline = (s: string): string =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

const cells = (row: string): string[] =>
  row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(6, (h[1] as string).length + 1);
      out.push(`<h${level}>${inline(h[2] as string)}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i] as string).startsWith('>')) buf.push((lines[i++] as string).replace(/^>\s?/, ''));
      out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] as string).trim().startsWith('|')) rows.push(cells(lines[i++] as string));
      const [head, sep, ...body] = rows;
      const hasSep = sep?.every((c) => /^:?-{3,}:?$/.test(c));
      const bodyRows = hasSep ? body : [sep ?? [], ...body].filter((r) => r.length);
      out.push(
        `<div class="table"><table><thead><tr>${(head ?? []).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
          `<tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
      );
      continue;
    }
    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*\d+\.\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i] as string)) items.push((lines[i++] as string).replace(re, ''));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && (lines[i] as string).trim() && !/^(#|>|\||\s*[-*]\s|\s*\d+\.\s)/.test(lines[i] as string)) buf.push(lines[i++] as string);
    if (buf.length === 0) buf.push(lines[i++] as string);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}
