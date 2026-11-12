/* ==========================================================================
 *  기억 05 — 검정 비니 (Black_Beanie.glb) — 마지막 기억
 *
 *  1. 부서진 기둥 위의 비니를 발견
 *  2. 3인칭: 손 뻗기(03) — interaction-manager 공통
 *  3. 비니가 들려 올라옴
 *  4. 비니 착용 동작(05) — 비니가 머리 위로 옮겨 가 씌워짐
 *  5. 짧은 3인칭 클로즈업 (착용 동작 자체가 중요한 장면이라 1인칭으로 바꾸지 않음)
 *  6. 회상 텍스트 → 마지막 문양 점등 (interaction-manager 공통)
 *
 *  · 착용 후 비니는 캐릭터 머리(머리 본, 없으면 도형 캐릭터의 머리 앵커)에 붙어 계속 따라다님
 *  · 크기·위치는 config.character.beanie에서 조정
 * ========================================================================== */
'use strict';

(function () {
  const CFG = DP.CONFIG;
  const U = DP.Util;
  const K = DP.Kit;
  const D2R = THREE.MathUtils.degToRad;

  AFRAME.registerComponent('beanie-object', {
    init() {
      this.cfg = K.place(this.el, 'beanie');
      const root = this.el.object3D;
      this.worn = false;
      this.ready = false;

      // 부서진 낮은 기둥
      K.mesh(root, new THREE.BoxGeometry(0.85, 0.22, 0.85), 'stoneDark', { pos: [0, 0.08, 0], rot: [0, 12, 0] });
      K.mesh(root, new THREE.CylinderGeometry(0.32, 0.34, 0.86, 12), 'stone', { pos: [0, 0.6, 0] });
      K.mesh(root, new THREE.BoxGeometry(0.42, 0.14, 0.32), 'stone', { pos: [-0.12, 1.06, 0.1], rot: [8, 30, 12] });
      K.mesh(root, new THREE.SphereGeometry(1, 12, 6), 'sandMound', { pos: [0, 0.03, 0], scale: [0.75, 0.18, 0.7], cast: false });
      DP.World.addCircle(this.cfg.x, this.cfg.z, 0.45);
      K.mergeStatic(root, []);

      this.beanie = K.group(root, [0.06, 1.03, -0.04], [0, 20, 0]);
      K.loadModel('beanie').then((m) => {
        this.beanie.add(m.root);
        this.model = m.root;
        this.ready = true;
      });

      const self = this;
      K.register({
        id: 'beanie',
        el: this.el,
        countsTowardPortal: true,
        radius: this.cfg.radius,
        prompt: () => self.cfg.prompt,
        enabled: () => self.ready && !self.worn,
        focus: (out) => self.beanie.getWorldPosition(out),
        interact: (ctx) => self.interact(ctx),
      });
    },

    /**
     * 비니를 머리 본 기준으로 놓을 '로컬' 변환 (캐릭터의 기본 자세 = 바인드 포즈 기준으로 한 번 계산)
     * 이전 방식은 착용 동작 중(고개를 숙인 순간)의 월드 위치로 붙여서, 고개를 들면 모자가 들리거나 앞으로 기울었음
     *  → 차렷 자세의 머리 꼭대기 기준으로 위치·각도를 정하고, 그 관계를 머리 본에 그대로 고정
     */
    headLocal() {
      if (this._headLocal) return this._headLocal;
      const ch = DP.Character;
      if (!ch || !ch.ready) return null;
      const C = CFG.character.beanie;
      const head = ch.headObject();
      let mesh = null;
      ch.model.traverse((o) => {
        if (!mesh && o.isSkinnedMesh) mesh = o;
      });
      if (!mesh || !head || !head.isBone) return null;
      const sk = mesh.skeleton;
      const hi = sk.bones.indexOf(head);
      if (hi < 0) return null;
      const headBind = new THREE.Matrix4().copy(sk.boneInverses[hi]).invert(); // 차렷 자세의 머리 (모델 공간)
      // 머리 꼭대기: HeadTop_End 본(머리의 자식)이 있으면 그 위치, 없으면 머리 본 위 0.18m
      const topBone = ch.findBone(/headtop/i, /^$/);
      const topPos = new THREE.Vector3();
      if (topBone && topBone.parent === head) topPos.setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(headBind, topBone.matrix));
      else topPos.setFromMatrixPosition(headBind).add(new THREE.Vector3(0, 0.18, 0));
      const s = (ch.info && ch.info.scale) || 1; // 모델 공간 → 월드 배율
      const yaw = -THREE.MathUtils.degToRad(CFG.character.rotationY || 0); // 모델 정면 = 게임 정면이 되도록
      const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(D2R(C.rotation.x), yaw + D2R(C.rotation.y), D2R(C.rotation.z), 'YXZ'));
      // offset(미터, 게임 기준: +y 위, -z 앞) → 모델 공간
      const off = new THREE.Vector3(C.offset.x, C.offset.y, C.offset.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).divideScalar(s);
      const M = new THREE.Matrix4().compose(topPos.add(off), R, new THREE.Vector3().setScalar(C.scale / s));
      const local = new THREE.Matrix4().copy(headBind).invert().multiply(M);
      // 머리 본이 바인드 포즈에서 갖는 모델 공간 기준이 메시 공간과 같다는 가정 (Meshy·Mixamo GLB 공통)
      this._headLocal = { head, local };
      return this._headLocal;
    },

    /** 머리 위 착용 지점 (월드) + 착용 회전 + 크기 */
    headTarget() {
      const hl = this.headLocal();
      if (hl) {
        hl.head.updateWorldMatrix(true, false);
        const w = new THREE.Matrix4().multiplyMatrices(hl.head.matrixWorld, hl.local);
        const pos = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const sc = new THREE.Vector3();
        w.decompose(pos, q, sc);
        return { head: hl.head, pos, q, scale: sc.x, local: hl.local };
      }
      const C = CFG.character.beanie;
      const glb = DP.Character && DP.Character.ready;
      const head = DP.Character.headObject();
      // GLB: 머리 꼭대기 본 기준 / 도형 캐릭터: 머리 앵커 기준
      const pos = (glb && DP.Character.headTopPosition()) || head.getWorldPosition(new THREE.Vector3());
      const facing = document.getElementById('player').components['player-controller'].facing;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(D2R(C.rotation.x), facing + D2R(C.rotation.y), D2R(C.rotation.z), 'YXZ'));
      const off = glb ? C.offset : { x: 0, y: 0.04, z: 0 };
      pos.add(new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(q));
      return { head, pos, q, scale: glb ? C.scale : 1.55 };
    },

    async interact(ctx) {
      const { camera, gs } = ctx;
      const scene = this.el.sceneEl.object3D;
      // 3. 비니가 들려 올라옴 (월드 기준으로 옮기기 위해 씬에 붙임)
      scene.attach(this.beanie);
      const start = this.beanie.position.clone();
      const startQ = this.beanie.quaternion.clone();
      DP.Audio.sfx('whoosh', start);
      await U.tween(0.8, (e) => {
        this.beanie.position.copy(start).add(new THREE.Vector3(0, e * 0.35, 0));
        this.beanie.rotation.y += 0.01;
      });

      // 4. 착용 동작(05) + 상반신 클로즈업 (짧은 3인칭)
      const hf = K.headFrame();
      const camPos = hf.pos.clone().addScaledVector(hf.fwd, 1.5).addScaledVector(hf.right, 0.55);
      camPos.y += 0.05;
      const look = hf.pos.clone();
      look.y -= 0.08;
      const camMove = camera.moveTo({ pos: camPos, look, duration: 1.4 });
      const wear = DP.Character.action('BEANIE_WEAR', { maxSec: 3.2 });
      const from = this.beanie.position.clone();
      const fromQ = this.beanie.quaternion.clone();
      const s0 = this.beanie.scale.x;
      // 머리가 움직이므로 매 프레임 목표를 다시 계산
      await U.tween(1.5, (e, t) => {
        const tg = this.headTarget();
        this.beanie.position.lerpVectors(from, tg.pos, e);
        this.beanie.position.y += Math.sin(t * Math.PI) * 0.22;
        this.beanie.quaternion.slerpQuaternions(fromQ, tg.q, e);
        this.beanie.scale.setScalar(U.lerp(s0, tg.scale, e));
      });
      // 머리에 고정 (월드 위치를 유지한 채 머리 본/앵커의 자식으로)
      const tg = this.headTarget();
      if (tg.local) {
        // 머리 본의 자식으로 넣고, 미리 계산한 로컬 위치·각도를 그대로 적용 (고개를 움직여도 같은 자리)
        tg.head.add(this.beanie);
        tg.local.decompose(this.beanie.position, this.beanie.quaternion, this.beanie.scale);
      } else {
        this.beanie.position.copy(tg.pos);
        this.beanie.quaternion.copy(tg.q);
        this.beanie.scale.setScalar(tg.scale);
        tg.head.attach(this.beanie);
      }
      // 눌러 쓰는 느낌
      const base = this.beanie.scale.clone();
      await U.tween(0.35, (e, t) => {
        const sq = Math.sin(t * Math.PI) * 0.08;
        this.beanie.scale.set(base.x * (1 + sq), base.y * (1 - sq), base.z * (1 + sq));
      });
      this.beanie.scale.copy(base);
      DP.Audio.sfx('cloth');
      await Promise.all([camMove, wear]);
      this.worn = true;
      gs.data.beanie_worn = true;
      await U.wait(1.0);
      void startQ;
      return { completed: true };
    },
  });
})();
