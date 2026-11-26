// 수업 설정 저장소 (프로토타입: 이 브라우저에만 임시 보관)
// TODO: 실제 서비스에서는 교사 권한을 서버에서 확인한 뒤에만 설정을 바꿀 수 있어야 한다.

import { DEFAULT_CLASSROOM } from '../data/classroom.js';
import { readJson, writeJson, removeKey } from './storage.js';

const STORAGE_KEY = 'checkyourprove.prototype.classroom.v1';

export function getClassroom() {
  return { ...DEFAULT_CLASSROOM, ...readJson(STORAGE_KEY, {}) };
}

export function saveClassroom(settings) {
  return writeJson(STORAGE_KEY, settings);
}

export function resetClassroom() {
  removeKey(STORAGE_KEY);
}
