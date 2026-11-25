import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../site/markdown';
import { VersusDemo, demoKnowledge } from '../../src/web/demo';

describe('site markdown renderer', () => {
  it('renders headings, quotes, lists, tables and bold', () => {
    const html = renderMarkdown('# T\n\n> quote\n\n- **a**: one\n- two\n\n1. x\n2. y\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nplain text');
    expect(html).toContain('<h2>T</h2>');
    expect(html).toContain('<blockquote><p>quote</p></blockquote>');
    expect(html).toContain('<ul><li><strong>a</strong>: one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>x</li><li>y</li></ol>');
    expect(html).toContain('<thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody>');
    expect(html).toContain('<p>plain text</p>');
  });

  it('escapes HTML from user text such as the pitch', () => {
    const html = renderMarkdown('# <img src=x onerror=alert(1)>\n\nPitch: <script>x</script> & "q"');
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders a real engine brief with every section', () => {
    const d = new VersusDemo(demoKnowledge(), { title: '<b>Evil</b>', pitch: '<script>alert(1)</script>', seed: 2 });
    for (let i = 0; i < 10; i++) {
      const [q] = d.next(1);
      if (!q) break;
      d.answer(q.questionId, q.multi ? 'neither' : 'a', q.multi ? [q.options[0]!.key] : undefined);
    }
    const html = renderMarkdown(d.brief().markdown);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Evil');
    for (const h of ['Frame', 'Design pillars', 'Core loop', 'Decision log']) expect(html).toContain(h);
  });

  it('keeps an escaped pipe inside its table cell', () => {
    const html = renderMarkdown('| A | B |\n| --- | --- |\n| x \\| y | z |');
    expect(html).toContain('<tr><td>x | y</td><td>z</td></tr>');
  });
});
