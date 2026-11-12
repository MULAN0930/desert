/* ==========================================================================
 *  Desert Passage — cinematic.js
 *  시네마틱 자막 시스템 (HTML/CSS 오버레이) — 모든 오브젝트가 재사용
 *
 *  DP.Cinematic.letterbox(on)          위아래 검정 띠
 *  DP.Cinematic.caption(text, sec)     상황 자막 한 줄 (자동으로 사라짐)
 *  DP.Cinematic.monologue(lines)       독백 여러 줄을 차례로 (자동 진행, 클릭으로 넘기기)
 *  DP.Cinematic.memory(mem)            회상 텍스트 — 제목 → 문장 → 완료 독백 → 확인
 *                                      (사용자가 넘김. 끝까지 확인하면 resolve)
 *
 *  · 넘기기: 클릭 (Space는 쓰지 않음)    · 건너뛰기: Q (남은 문장을 모두 넘기고 바로 확인 단계로)
 *  · 건너뛰어도 Promise는 정상적으로 끝나므로 게임 상태가 망가지지 않음
 *  · 독백과 회상은 대기열로 하나씩 재생 (겹치지 않음). 입력 대기는 각자 따로 관리해서
 *    한쪽이 끝날 때 다른 쪽의 입력 대기를 지우지 않음 → 클릭·키가 먹통이 되지 않음
 *  · 포인터 락을 풀지 않아도 클릭으로 넘길 수 있음 (마우스 시점 조작이 끊기지 않음)
 * ========================================================================== */
'use strict';

window.DP = window.DP || {};

DP.Cinematic = (function () {
  const U = DP.Util;
  let els = null;
  let waiter = null; // 현재 입력을 기다리는 함수 (가장 최근에 시작된 대기)
  let skipAll = false;
  let queue = Promise.resolve(); // 독백·회상 재생 순서
  let activeCount = 0;

  /** 독백·회상을 대기열에 넣어 하나씩 재생 (앞 것이 오류로 끝나도 다음 것은 진행) */
  function enqueue(fn) {
    const run = queue.then(async () => {
      activeCount++;
      try {
        return await fn();
      } finally {
        activeCount--;
      }
    });
    queue = run.catch((e) => console.error('[cinematic] 자막 재생 오류', e));
    return run;
  }

  function build() {
    if (els) return els;
    const cap = document.createElement('div');
    cap.id = 'cine-caption';
    const mem = document.createElement('div');
    mem.id = 'cine-memory';
    mem.innerHTML = `
      <p class="mem-title"></p>
      <p class="mem-line"></p>
      <p class="mem-notice"></p>
      <p class="mem-hint"></p>`;
    document.body.append(cap, mem);
    els = {
      cap,
      mem,
      title: mem.querySelector('.mem-title'),
      line: mem.querySelector('.mem-line'),
      notice: mem.querySelector('.mem-notice'),
      hint: mem.querySelector('.mem-hint'),
    };
    // 입력: 클릭 = 다음, Q = 건너뛰기 (Space·Enter는 아무 동작도 하지 않음)
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && waiter) waiter('next');
    });
    window.addEventListener('keydown', (e) => {
      // 게임 중 Space·Enter는 막아 둠 — 버튼 재클릭·페이지 스크롤 같은 브라우저 기본 동작 방지
      if ((e.code === 'Space' || e.code === 'Enter') && document.body.classList.contains('playing')) {
        e.preventDefault();
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      }
      if (!waiter) return;
      if (e.code === 'KeyQ') {
        waiter('skip');
      }
    });
    return els;
  }

  /** 입력 대기 (minSec 전에는 무시 → 앞 단계 클릭이 넘어오지 않음). auto초가 지나면 자동 진행 */
  function waitInput(minSec = 0.6, auto = 0) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let timer = null;
      let done = false;
      const me = (kind) => {
        if (kind === 'skip') {
          skipAll = true;
          finish('skip');
        } else if ((performance.now() - t0) / 1000 >= minSec) finish('next');
      };
      const finish = (kind) => {
        if (done) return;
        done = true;
        if (waiter === me) waiter = null; // 내 대기만 지움 (다른 대기를 지우지 않음)
        if (timer) clearTimeout(timer);
        resolve(kind);
      };
      waiter = me;
      if (auto > 0) timer = setTimeout(() => finish('auto'), auto * 1000);
    });
  }

  function show(el, on) {
    el.classList.toggle('show', on);
  }

  /** 문장 길이에 맞춘 읽기 시간 */
  const readTime = (text) => U.clamp(1.6 + text.length * 0.075, 2.4, 6.5);

  /** 글자마다 감싸서 방금 쓴 손글씨처럼 조금씩 흔들리게 (공백은 그대로 → 줄바꿈 유지) */
  function writeWobbly(el, text) {
    el.textContent = '';
    const ink = document.createElement('span'); // 한 덩어리로 감싸야 flex 줄에서도 띄어쓰기가 유지됨
    ink.className = 'ink';
    el.appendChild(ink);
    for (const ch of Array.from(text)) {
      if (ch === ' ') {
        ink.appendChild(document.createTextNode(' '));
        continue;
      }
      const s = document.createElement('span');
      s.className = 'wob';
      s.textContent = ch;
      s.style.animationDelay = `${(-Math.random() * 1.2).toFixed(2)}s`;
      s.style.animationDuration = `${(0.9 + Math.random() * 0.5).toFixed(2)}s`;
      ink.appendChild(s);
    }
  }

  async function setLine(el, text) {
    show(el, false);
    await U.wait(0.35);
    writeWobbly(el, text);
    show(el, true);
  }

  return {
    letterbox(on) {
      document.body.classList.toggle('cinematic', !!on);
    },

    /** 상황 자막 한 줄 — 기다리지 않아도 됨 */
    async caption(text, sec) {
      const E = build();
      E.cap.classList.remove('monologue');
      await setLine(E.cap, text);
      const id = (this._capId = (this._capId || 0) + 1);
      await U.wait(sec || readTime(text));
      if (this._capId === id) show(E.cap, false);
    },

    hideCaption() {
      if (els) show(els.cap, false);
    },

    /** 독백 여러 줄 (자동 진행 · 클릭으로 다음 · Q로 건너뛰기) */
    monologue(lines, opts = {}) {
      return enqueue(() => this._monologue(lines, opts));
    },

    async _monologue(lines, opts) {
      const E = build();
      skipAll = false;
      E.cap.classList.add('monologue');
      for (const text of lines) {
        if (skipAll) break;
        await setLine(E.cap, text);
        await waitInput(0.5, opts.manual ? 0 : readTime(text) + 0.6);
      }
      show(E.cap, false);
      await U.wait(0.4);
      E.cap.classList.remove('monologue');
    },

    /**
     * 회상 텍스트
     * @param {{title:string, body:string[], monologue?:string, notice?:string}} mem
     */
    memory(mem) {
      return enqueue(() => this._memory(mem));
    },

    async _memory(mem) {
      const E = build();
      skipAll = false;
      this.hideCaption();
      E.title.textContent = mem.title || ''; // 제목은 깔끔한 글씨체 (흔들림 없음)
      E.line.textContent = '';
      E.notice.textContent = mem.notice || '';
      E.hint.textContent = '';
      E.mem.classList.remove('final');
      show(E.mem, true);
      show(E.notice, !!mem.notice);
      await U.wait(0.6);
      show(E.title, true);
      await U.wait(0.5);
      for (const text of mem.body || []) {
        if (skipAll) break;
        await setLine(E.line, text);
        E.hint.textContent = '클릭  다음     Q  건너뛰기';
        show(E.hint, true);
        await waitInput(0.8);
      }
      // 완료 독백 + 확인
      if (mem.monologue) {
        E.mem.classList.add('final');
        await setLine(E.line, `“${mem.monologue}”`);
      }
      E.hint.textContent = '클릭  확인';
      show(E.hint, true);
      skipAll = false;
      await waitInput(1.0);
      show(E.mem, false);
      for (const k of ['title', 'line', 'notice', 'hint']) show(E[k], false);
      await U.wait(0.6);
    },

    /** 독백·회상이 재생 중인지 */
    isWaiting() {
      return activeCount > 0;
    },
  };
})();
