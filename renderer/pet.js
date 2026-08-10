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
  let interactive = true;  // 窗口当前是否拦截鼠标事件
  let dragState = null;    // { sx, sy, wx, wy, moved }

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

  function say(text, state) {
    bubbleText.textContent = text || '…';
    bubble.classList.remove('hidden');
    if (state) setState(state);
    bubbleText.scrollTop = 0;
  }

  function hideBubble() { bubble.classList.add('hidden'); }
  function toggleMenu() { hideBubble(); menu.classList.toggle('hidden'); }

  // 透明区域点击穿透：悬停菲比/气泡/菜单 → 拦截鼠标；透明区 → 穿透到桌面
  function setInteractive(v) {
    v = !!v;
    if (v === interactive) return;
    interactive = v;
    petApi.setInteractive(v);
  }
  function updateInteractive(e) {
    const over = !!(e.target && e.target.closest && e.target.closest('#pet, #bubble, #menu'));
    setInteractive(over);
  }

  async function doAction(act) {
    if (busy) return;
    busy = true;
    menu.classList.add('hidden');
    if (act === 'hide') {
      hideBubble();
      petApi.hide();
      busy = false;
      return;
    }
    const msgs = {
      check: ['📋 菲比正在检查代码…', 'thinking'],
      compile: ['🛠 正在编译…', 'working'],
      run: ['▶ 准备运行…', 'working']
    };
    const [m, s] = msgs[act] || ['…', 'thinking'];
    say(m, s);
    const r = await petApi.action(act);
    busy = false;
    if (r && r.ok) {
      setState('happy');
      say(r.text || '搞定～', 'happy');
    } else {
      setState('sad');
      say((r && r.text) || '出错了…', 'sad');
    }
  }

  // ---- 拖动与点击（手动实现，取代 -webkit-app-region，避免吞掉点击事件）----
  pet.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragState = { sx: e.screenX, sy: e.screenY, wx: window.screenX, wy: window.screenY, moved: false };
    setInteractive(true); // 拖动期间必须拦截鼠标事件
  });
  document.addEventListener('mousemove', (e) => {
    if (dragState) {
      const dx = e.screenX - dragState.sx;
      const dy = e.screenY - dragState.sy;
      if (!dragState.moved && Math.abs(dx) + Math.abs(dy) > 4) dragState.moved = true; // 位移阈值：区分点击与拖动
      if (dragState.moved) petApi.moveTo(dragState.wx + dx, dragState.wy + dy);       // 主进程会钳制在屏幕工作区内
    } else {
      updateInteractive(e);
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (dragState) {
      const wasDrag = dragState.moved;
      dragState = null;
      if (!wasDrag && !busy) toggleMenu(); // 点击（未拖动）→ 弹出菜单
      updateInteractive(e);                // 释放后按光标位置恢复穿透/交互
    }
  });

  // 右键也打开菜单（备用入口）
  pet.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleMenu(); });

  menu.querySelectorAll('.menu-item').forEach((btn) => {
    btn.addEventListener('click', () => doAction(btn.dataset.act));
  });
  document.getElementById('bubble-close').addEventListener('click', hideBubble);

  // 开场白
  setState('idle');
  setTimeout(() => say('你好呀，我是菲比～\n点我一下，可以检查代码、编译、运行哦！', 'idle'), 600);
})();
