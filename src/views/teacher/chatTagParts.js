// AI 대화 태그 화면들이 함께 쓰는 도구: 대화 순서, 태그 이름 찾기, 채점자 고르기

import { blindOrder, getGrading } from '../../state/gradingStore.js';
import { conversations, researchStudents } from '../../state/researchRoster.js';
import { escapeHtml } from '../../ui/dom.js';

/** 지금 설정(예시 학생 포함, 블라인드)에 따른 대화 목록과 순서. 블라인드면 채점자별 무작위 순서이고 학생 이름을 가린다. */
export function chatQueue(raterId) {
  const g = getGrading();
  const list = conversations(researchStudents({ includeSamples: g.includeSamples, sessionIds: g.scopeSessionIds }));
  const byKey = new Map(list.map((c) => [c.key, c]));
  const keys = g.blind ? blindOrder(raterId, list.map((c) => `chat:${c.key}`)).map((k) => k.slice(5)) : list.map((c) => c.key);
  return { convs: keys.map((k) => byKey.get(k)), blind: g.blind };
}

export const tagLabel = (tags, id) => tags.find((t) => t.id === id)?.label ?? '(지운 태그)';

/** 대화 기록에 붙인 태그 id 전부(메시지 + 대화 전체) */
export const allTagIds = (record) => (record ? [...Object.values(record.messages ?? {}).flat(), ...(record.conversation ?? [])] : []);

/** 채점자 고르기 (증명 채점과 같은 채점자를 쓴다) */
export function raterChoice(g, raterId) {
  return `<fieldset class="choice-group" data-rater-choice>
    <legend>지금 태그를 붙이는 사람</legend>
    <p class="field__help">증명 채점과 같은 채점자입니다. 채점자마다 따로 태그를 붙이고, 두 사람이 모두 마친 대화로 일치도를 계산합니다.</p>
    ${g.raters.map((r) => `<label class="check">
      <input type="radio" name="rater" value="${r.id}"${r.id === raterId ? ' checked' : ''}>
      <span>${escapeHtml(r.name)} <span class="meta">${Object.values(g.chatTagging?.[r.id] ?? {}).filter((rec) => rec.doneAt).length}개 대화 마침</span></span>
    </label>`).join('')}
  </fieldset>`;
}
