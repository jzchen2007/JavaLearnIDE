'use strict';
// ============ 菲比桌宠 ============
(function () {
  const petApi = window.petApi;
  const pet = document.getElementById('pet');
  const bubble = document.getElementById('bubble');
  const bubbleText = document.getElementById('bubble-text');
  const bubbleState = document.getElementById('bubble-state');
  const menu = document.getElementById('menu');
  let busy = false;

  function setState(s) {
    pet.className = s;
    const names = { idle: '待机', working: '敲代码中…', happy: '完成啦～', sad: '遇到问题…', thinking: '思考中…' };
    bubbleState.textContent = names[s] || s;
  }

  function say(text, state) {
    bubbleText.textContent = text || '…';
    bubble.classList.remove('hidden');
    if (state) setState(state);
    bubbleText.scrollTop = 0;
  }

  function hideBubble() { bubble.classList.add('hidden'); }

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
      setState(act === 'check' ? 'happy' : 'happy');
      say(r.text || '搞定～', act === 'check' ? 'happy' : 'happy');
    } else {
      setState('sad');
      say((r && r.text) || '出错了…', 'sad');
    }
  }

  // 点击菲比 → 切换菜单
  pet.addEventListener('click', () => {
    if (busy) return;
    hideBubble();
    menu.classList.toggle('hidden');
  });

  // 点击空白处关闭菜单
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== pet) {
      menu.classList.add('hidden');
    }
  });

  menu.querySelectorAll('.menu-item').forEach((btn) => {
    btn.addEventListener('click', () => doAction(btn.dataset.act));
  });

  document.getElementById('bubble-close').addEventListener('click', hideBubble);

  // 开场白
  setState('idle');
  setTimeout(() => say('你好呀，我是菲比～\n点我一下，可以检查代码、编译、运行哦！', 'idle'), 600);
})();
