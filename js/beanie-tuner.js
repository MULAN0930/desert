/* ==========================================================================
 *  Desert Passage — beanie-tuner.js
 *  비니 위치 직접 맞추기 (제작용 도구)
 *
 *  사용법
 *   1. 게임 중 B 키 → 오른쪽에 조절판이 열리고, 비니가 바로 머리에 씌워짐 (아직 안 썼어도 미리보기)
 *   2. 슬라이더를 마우스로 움직이면 실시간으로 비니가 움직임
 *      좌우(x) · 높이(y) · 앞뒤(z) · 기울기(앞뒤/좌우/돌리기) · 크기
 *   3. [정면] [옆] [뒤] 버튼으로 카메라를 바꿔 가며 확인
 *   4. [값 복사] → js/config.js 의 `beanie: { offset ... }` 한 줄을 붙여넣어 교체하고 저장
 *      (복사가 안 되면 조절판 아래에 나온 한 줄을 직접 드래그해서 복사)
 *   5. 다시 B 키 → 닫기 (카메라는 원래대로)
 *
 *  · 발표 때는 B 키를 누르지 않으면 아무것도 보이지 않습니다.
 *  · 이 도구를 빼려면 index.html 에서 beanie-tuner.js 줄을 지우면 됩니다.
 * ========================================================================== */
'use strict';

(function () {
  const CFG = DP.CONFIG;
  const FIELDS = [
    // [라벨, 경로, 최소, 최대, 간격]
    ['좌우 x (m)', ['offset', 'x'], -0.08, 0.08, 0.002],
    ['높이 y (m)', ['offset', 'y'], -0.3, 0.12, 0.002],
    ['앞뒤 z (m, - 앞)', ['offset', 'z'], -0.12, 0.12, 0.002],
    ['앞뒤 기울기 (도)', ['rotation', 'x'], -45, 45, 1],
    ['돌리기 (도)', ['rotation', 'y'], -45, 45, 1],
    ['좌우 기울기 (도)', ['rotation', 'z'], -30, 30, 1],
    ['크기', ['scale'], 0.4, 1.6, 0.01],
  ];

  let panel = null;
  let open = false;
  let out = null;

  function beanieComp() {
    const el = document.getElementById('object-beanie');
    return el && el.components['beanie-object'];
  }

  function get(path) {
    const B = CFG.character.beanie;
    return path.length === 1 ? B[path[0]] : B[path[0]][path[1]];
  }
  function set(path, v) {
    const B = CFG.character.beanie;
    if (path.length === 1) B[path[0]] = v;
    else B[path[0]][path[1]] = v;
  }

  function configLine() {
    const B = CFG.character.beanie;
    const r = (n) => +n.toFixed(3);
    return `beanie: { offset: { x: ${r(B.offset.x)}, y: ${r(B.offset.y)}, z: ${r(B.offset.z)} }, rotation: { x: ${r(B.rotation.x)}, y: ${r(B.rotation.y)}, z: ${r(B.rotation.z)} }, scale: ${r(B.scale)} },`;
  }

  /** 현재 값으로 비니를 머리에 다시 붙임 */
  function apply() {
    const b = beanieComp();
    if (!b || !b.beanie) return;
    b._headLocal = null; // 저장된 위치 계산을 지우고 새 값으로 다시 계산
    const tg = b.headTarget();
    if (tg.local) {
      if (b.beanie.parent !== tg.head) tg.head.add(b.beanie);
      tg.local.decompose(b.beanie.position, b.beanie.quaternion, b.beanie.scale);
    } else {
      b.beanie.position.copy(tg.pos);
      b.beanie.quaternion.copy(tg.q);
      b.beanie.scale.setScalar(tg.scale);
      tg.head.attach(b.beanie);
    }
    b.beanie.visible = true;
    if (out) out.textContent = configLine();
  }

  /** 머리 주변 카메라 (angle: 0 정면, 90 옆, 180 뒤) */
  function view(angleDeg) {
    const cam = document.getElementById('camera').components['camera-director'];
    const pc = document.getElementById('player').components['player-controller'];
    const p = document.getElementById('player').object3D.position;
    const f = pc.facing + THREE.MathUtils.degToRad(angleDeg);
    const look = new THREE.Vector3(p.x, p.y + 1.58, p.z);
    const pos = new THREE.Vector3(p.x - Math.sin(f) * 0.75, p.y + 1.66, p.z - Math.cos(f) * 0.75);
    cam.setShot(pos, look);
    cam.hideAvatar = false;
    document.getElementById('avatar').object3D.visible = true;
  }

  function build() {
    panel = document.createElement('div');
    panel.id = 'beanie-tuner';
    panel.innerHTML = '<p class="bt-title">비니 위치 조절 <span>(B 닫기)</span></p>';
    for (const [label, path, min, max, step] of FIELDS) {
      const row = document.createElement('label');
      row.className = 'bt-row';
      const name = document.createElement('span');
      name.textContent = label;
      const val = document.createElement('b');
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min, max, step, value: get(path) });
      val.textContent = (+get(path)).toFixed(3);
      input.addEventListener('input', () => {
        set(path, parseFloat(input.value));
        val.textContent = parseFloat(input.value).toFixed(3);
        apply();
      });
      row.append(name, val, input);
      panel.appendChild(row);
    }
    const btns = document.createElement('div');
    btns.className = 'bt-btns';
    for (const [t, a] of [['정면', 0], ['옆', 90], ['뒤', 180], ['반대 옆', -90]]) {
      const b = document.createElement('button');
      b.textContent = t;
      b.addEventListener('click', () => view(a));
      btns.appendChild(b);
    }
    const copy = document.createElement('button');
    copy.textContent = '값 복사';
    copy.className = 'bt-copy';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(configLine());
        copy.textContent = '복사됨 ✓';
      } catch (e) {
        copy.textContent = '아래 줄을 직접 복사';
      }
      setTimeout(() => (copy.textContent = '값 복사'), 1600);
    });
    btns.appendChild(copy);
    panel.appendChild(btns);
    out = document.createElement('code');
    out.className = 'bt-out';
    panel.appendChild(out);
    // 패널 안의 클릭이 게임(자막 넘기기·시점)으로 새지 않게
    for (const ev of ['mousedown', 'mouseup', 'click', 'mousemove']) panel.addEventListener(ev, (e) => e.stopPropagation());
    document.body.appendChild(panel);
  }

  function toggle() {
    if (!document.body.classList.contains('playing')) return;
    open = !open;
    if (!panel) build();
    panel.classList.toggle('show', open);
    const gs = document.querySelector('a-scene').systems['game-state'];
    const cam = document.getElementById('camera').components['camera-director'];
    if (open) {
      if (document.exitPointerLock) document.exitPointerLock();
      gs.lockMovement('beanie-tuner');
      apply();
      view(0);
    } else {
      gs.unlockMovement('beanie-tuner');
      // 아직 비니 인터랙션을 안 했으면 미리보기 비니를 원래 자리(받침 위)로
      const b = beanieComp();
      if (b && !b.worn && b.beanie && b.homeParent) {
        b.homeParent.add(b.beanie);
        b.beanie.position.copy(b.homePos);
        b.beanie.quaternion.copy(b.homeQ);
        b.beanie.scale.copy(b.homeScale);
      }
      cam.toBase(0.8);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyB' || e.repeat) return;
    const b = beanieComp();
    // 미리보기 전에 받침 위 원래 자리를 기억
    if (b && b.beanie && !b.homeParent && !b.worn) {
      b.homeParent = b.beanie.parent;
      b.homePos = b.beanie.position.clone();
      b.homeQ = b.beanie.quaternion.clone();
      b.homeScale = b.beanie.scale.clone();
    }
    toggle();
  });
})();
