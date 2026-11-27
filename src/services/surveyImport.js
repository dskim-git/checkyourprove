// 설문 문항 한꺼번에 붙여넣기 (구현 7): 논문·엑셀에서 복사한 문항 목록을 문항으로 바꾼다.
// 한 줄에 한 문항. 엑셀에서 복사하면 칸이 탭으로 나뉜다. 알아보는 칸(순서는 상관없음):
//   원문항 번호(예: 1, 3., Q4, 문5) · 하위 요인 이름 · 문항 글(가장 긴 칸) · 역문항 표시(R, 역, 역문항, 역채점, *)
// 칸이 하나뿐이면 문항 글로 보고, 앞의 "1." "2)" 같은 번호와 뒤의 "(R)" "(역)" "*" 표시를 떼어 낸다.
// 모르는 하위 요인 이름은 새 하위 요인으로 만든다(미리 보기에서 보여 줌).

const REVERSE_MARK = /^(r|\(r\)|역|역문항|역채점|역코딩|reverse|reversed|\*)$/i;
const TRAIL_REVERSE = /\s*(\((r|역|역문항|역채점)\)|\*)\s*$/i;
const NUMBER_CELL = /^([a-z가-힣]{0,2}\s?\d{1,3})[.)]?$/i;
const LEAD_NUMBER = /^\s*([a-z]{0,2}\d{1,3})\s*[.)]\s+/i;

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s) => norm(s).toLowerCase();

/**
 * text: 붙여넣은 글, domains: 지금 하위 요인 [{ id, label }], defaultDomain: 하위 요인 칸이 없을 때 쓸 id, defaultType: 문항 형식
 * 돌려줌: { items: [{ text, domain, newDomain(이름, 새로 만들 때), reverse, sourceNo, sourceText, type }], newDomains: [이름], skipped }
 */
export function parseItems(text, { domains, defaultDomain, defaultType = 'scale' }) {
  const items = [];
  const newDomains = [];
  let skipped = 0;
  String(text ?? '').split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    let cells = line.split('\t').map(norm).filter(Boolean);
    let reverse = false;
    let sourceNo = '';
    // 역문항 칸
    const rev = cells.findIndex((c) => REVERSE_MARK.test(c));
    if (rev !== -1 && cells.length > 1) {
      reverse = true;
      cells.splice(rev, 1);
    }
    // 번호 칸 (첫 칸이 짧은 번호)
    if (cells.length > 1 && NUMBER_CELL.test(cells[0])) sourceNo = cells.shift().replace(/[.)]$/, '');
    if (!cells.length) {
      skipped += 1;
      return;
    }
    // 문항 글 = 가장 긴 칸, 하위 요인 = 남은 칸 중 첫 칸
    const textIndex = cells.reduce((best, c, i) => (c.length > cells[best].length ? i : best), 0);
    let body = cells[textIndex];
    const original = body;
    const rest = cells.filter((_, i) => i !== textIndex);
    if (!sourceNo) {
      const m = body.match(LEAD_NUMBER);
      if (m) {
        sourceNo = m[1];
        body = body.slice(m[0].length);
      }
    }
    if (TRAIL_REVERSE.test(body)) {
      reverse = true;
      body = body.replace(TRAIL_REVERSE, '');
    }
    body = norm(body);
    if (!body) {
      skipped += 1;
      return;
    }
    let domain = defaultDomain;
    let newDomain = '';
    const label = rest[0];
    if (label) {
      const found = domains.find((d) => key(d.label) === key(label));
      if (found) domain = found.id;
      else {
        newDomain = label;
        domain = null;
        if (!newDomains.some((n) => key(n) === key(label))) newDomains.push(label);
      }
    }
    items.push({ text: body, domain, newDomain, reverse: defaultType === 'scale' && reverse, sourceNo, sourceText: original, type: defaultType });
  });
  return { items, newDomains, skipped };
}
