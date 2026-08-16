'use strict';
// ============ 菲比桌宠 (GIF 动画版) ============
(function () {
  const petApi = window.petApi;
  const pet = document.getElementById('pet');
  const petImg = document.getElementById('pet-img');
  const bubble = document.getElementById('bubble');
  const bubbleText = document.getElementById('bubble-text');
  const bubbleState = document.getElementById('bubble-state');
  const menu = document.getElementById('menu');
  let busy = false;
  let dragState = null;
  let idleTimer = null; // 动作完成后自动回待机的定时器

  // 状态 ↔ GIF 映射
  const stateMap = {
    idle:     { gif: 'idle.gif',     label: '待机' },
    working:  { gif: 'running.gif',  label: '敲代码中…' },
    thinking: { gif: 'waiting.gif',  label: '思考中…' },
    happy:    { gif: 'review.gif',   label: '完成啦～' },
    sad:      { gif: 'failed.gif',   label: '遇到问题…' }
  };

  function setState(s) {
    pet.className = s;
    const info = stateMap[s];
    if (info) {
      petImg.src = 'pet/' + info.gif;
      bubbleState.textContent = info.label;
    }
  }

  // 气泡/菜单打开时窗口向上增高，全部关闭后恢复贴合菲比
  function syncPanel() {
    const open = !bubble.classList.contains('hidden') || !menu.classList.contains('hidden');
    petApi.setPanel(open);
  }

  function say(text, state) {
    bubbleText.textContent = text || '…';
    bubble.classList.remove('hidden');
    if (state) setState(state);
    bubbleText.scrollTop = 0;
    syncPanel();
  }

  function hideBubble() { bubble.classList.add('hidden'); syncPanel(); }
  function toggleMenu() { hideBubble(); menu.classList.toggle('hidden'); syncPanel(); }

  async function doAction(act) {
    if (busy) return;
    busy = true;
    menu.classList.add('hidden');
    syncPanel();
    try {
      if (act === 'hide') {
        hideBubble();
        petApi.hide();
        return;
      }
      const msgs = {
        check: ['菲比正在检查代码…', 'thinking'],
        compile: ['正在编译…', 'working'],
        run: ['准备运行…', 'working'],
        judge: ['正在判题…', 'working']
      };
      const [m, s] = msgs[act] || ['…', 'thinking'];
      say(m, s);
      // 超时保护：IPC 卡住/异常时强制结束动作，避免 busy 永久卡死（菲比不会永远停在思考表情）
      let r;
      try {
        r = await Promise.race([
          petApi.action(act),
          new Promise((_, rej) => setTimeout(() => rej(new Error('操作超时（45 秒）')), 45000))
        ]);
      } catch (e) {
        setState('sad');
        say((e && e.message) || '操作失败…', 'sad');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => setState('idle'), 4000); // 异常路径同样自动回待机
        return;
      }
      if (r && r.ok) {
        setState('happy');
        say(r.text || '搞定～', 'happy');
      } else {
        setState('sad');
        say((r && r.text) || '出错了…', 'sad');
      }
    } finally {
      busy = false; // 无论成功/失败/异常，都释放忙碌锁
    }
    // 动作完成 4 秒后自动回待机（菲比不会一直停留在一个表情）
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setState('idle'), 4000);
  }

  // ---- 拖动与点击（坐标运算统一在主进程，避免 DPI 缩放导致单位不一致而漂移）----
  pet.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragState = { sx: e.screenX, sy: e.screenY, moved: false };
    petApi.dragStart();
    pet.classList.add('pressed'); // 按压反馈
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const dx = e.screenX - dragState.sx;
    const dy = e.screenY - dragState.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) { // 位移阈值：区分点击与拖动
      dragState.moved = true;
      petApi.dragMove();
    }
  });
  document.addEventListener('mouseup', () => {
    if (!dragState) return;
    const wasDrag = dragState.moved;
    dragState = null;
    petApi.dragEnd();
    pet.classList.remove('pressed');
    if (!wasDrag && !busy) {
      toggleMenu(); // 点击（未拖动）→ 弹出菜单
      // 点击弹跳效果（动画结束后移除 class）
      pet.classList.remove('pop');
      void pet.offsetWidth; // 强制重排以重启动画
      pet.classList.add('pop');
      setTimeout(() => pet.classList.remove('pop'), 450);
    }
  });

  // 点击菲比/气泡/菜单之外的空白 → 关闭气泡与菜单
  document.addEventListener('click', (e) => {
    if (e.target.closest('#pet') || e.target.closest('#bubble') || e.target.closest('#menu')) return;
    if (!bubble.classList.contains('hidden') || !menu.classList.contains('hidden')) {
      bubble.classList.add('hidden');
      menu.classList.add('hidden');
      syncPanel();
    }
  });

  // 右键也打开菜单（备用入口）
  pet.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleMenu(); });

  menu.querySelectorAll('.menu-item').forEach((btn) => {
    btn.addEventListener('click', () => doAction(btn.dataset.act));
  });
  document.getElementById('bubble-close').addEventListener('click', hideBubble);

  // 主进程重新显示桌宠后，恢复面板尺寸同步
  petApi.onResync(() => syncPanel());

  // 开场白
  setState('idle');
  setTimeout(() => say('你好呀，我是菲比～\n点我一下，可以检查代码、编译、运行哦！', 'idle'), 600);
})();
