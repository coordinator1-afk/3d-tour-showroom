/* =====================================================================
   app.js — logic trình xem
   - Chuỗi frame: cuộn / kéo chuột để xoay (turntable 360°)
   - Mặt bằng 2D: lăn để zoom, kéo để di chuyển
   Không dùng thư viện ngoài.
   ===================================================================== */
(function () {
  'use strict';

  var CFG     = window.SITE_CONFIG || {};
  var SCENES  = CFG.scenes || [];
  var FRAMES  = CFG.frames || {};

  /* Nhãn hiển thị theo từng chế độ xem */
  var MODE_LABEL = { '360': 'NGOẠI CẢNH', '2d': 'NỘI THẤT', 'pano': 'NỘI THẤT 360' };

  var el = {
    canvas:      document.getElementById('framesView'),
    planView:    document.getElementById('planView'),
    planImage:   document.getElementById('planImage'),
    panoView:    document.getElementById('panoView'),
    menuBtn:     document.getElementById('menuBtn'),
    drawer:      document.getElementById('drawer'),
    drawerList:  document.getElementById('drawerList'),
    drawerClose: document.getElementById('drawerClose'),
    scrim:       document.getElementById('scrim'),
    modebar:     document.getElementById('modebar'),
    imgbar:      document.getElementById('imgbar'),
    toolbar:     document.getElementById('toolbar'),
    hint:        document.getElementById('hint'),
    hintText:    document.getElementById('hintText'),
    loader:      document.getElementById('loader'),
    loaderBar:   document.getElementById('loaderBar'),
    loaderPct:   document.getElementById('loaderPct'),
    notice:      document.getElementById('notice'),
    sceneIdx:    document.getElementById('sceneIdx'),
    sceneName:   document.getElementById('sceneName')
  };

  var ctx = el.canvas.getContext('2d');

  /* --------------------------------------------------------------- utils */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }
  function on(target, type, fn, opts) { if (target) target.addEventListener(type, fn, opts); }

  /* ==============================================================
     CHUỖI FRAME — "cuộn để xoay"
     ============================================================== */
  var T = {
    active: false,        // khung nhìn frame có đang hiện không
    seq: null,            // cấu hình chuỗi
    width: 0,             // bộ kích thước đang dùng
    count: 0,
    images: [],           // HTMLImageElement
    ready: [],            // đã tải xong?
    pos: 0,               // vị trí hiện tại (số thực, 0..count)
    vel: 0,               // quán tính
    spin: false,          // tự động xoay
    dragging: false,
    lastX: 0,
    dirty: true,
    lastDrawn: -1,
    w: 0, h: 0,
    failed: false
  };

  function frameUrl(i) {
    return String(FRAMES.template || 'frames/{w}/frame_{i}.webp')
      .replace('{w}', T.width)
      .replace('{i}', pad(i + (FRAMES.start || 0), FRAMES.pad || 3));
  }

  /* Chọn bộ kích thước ảnh phù hợp với màn hình */
  function pickFrameWidth() {
    var sizes = (FRAMES.sizes || [1920, 1280, 960]).slice().sort(function (a, b) { return a - b; });
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var need = Math.round(Math.max(window.innerWidth, window.innerHeight * (16 / 9)) * dpr);
    for (var i = 0; i < sizes.length; i++) { if (sizes[i] >= need) return sizes[i]; }
    return sizes[sizes.length - 1];
  }

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    T.w = window.innerWidth;
    T.h = window.innerHeight;
    el.canvas.width  = Math.round(T.w * dpr);
    el.canvas.height = Math.round(T.h * dpr);
    el.canvas.style.width  = T.w + 'px';
    el.canvas.style.height = T.h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    T.dirty = true;
  }

  /* Tìm frame đã tải gần nhất — tránh nhấp nháy khi đang tải dở */
  function nearestReady(i) {
    if (T.ready[i]) return i;
    for (var d = 1; d < T.count; d++) {
      var a = (i - d + T.count) % T.count;
      var b = (i + d) % T.count;
      if (T.ready[a]) return a;
      if (T.ready[b]) return b;
    }
    return -1;
  }

  function drawFrame() {
    if (!T.w || !T.h || !T.count) return;

    var idx = Math.round(T.pos) % T.count;
    if (idx < 0) idx += T.count;

    var use = nearestReady(idx);
    if (use < 0) return;
    if (!T.dirty && use === T.lastDrawn) return;

    var img = T.images[use];
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;

    /* cắt theo kiểu "cover" cho kín khung */
    var ir = iw / ih, cr = T.w / T.h;
    var sx, sy, sw, sh;
    if (ir > cr) { sh = ih; sw = sh * cr; sx = (iw - sw) / 2; sy = 0; }
    else         { sw = iw; sh = sw / cr; sx = 0; sy = (ih - sh) / 2; }

    ctx.clearRect(0, 0, T.w, T.h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, T.w, T.h);

    T.lastDrawn = use;
    T.dirty = false;
  }

  function tick() {
    requestAnimationFrame(tick);
    if (!T.active || T.failed) return;

    if (T.spin && !T.dragging) T.pos += 0.4;

    if (!T.dragging && Math.abs(T.vel) > 0.02) {
      T.pos += T.vel;
      T.vel *= 0.93;
    } else if (!T.dragging) {
      T.vel = 0;
    }

    if (T.pos < 0 || T.pos >= T.count) {
      T.pos = ((T.pos % T.count) + T.count) % T.count;
    }
    drawFrame();
  }

  /* Tải chuỗi ảnh theo nhiều đợt: thưa trước, dày sau → xoay được ngay */
  function loadSequence() {
    if (T.seq) return;
    T.seq = true;
    T.width = pickFrameWidth();
    T.count = FRAMES.count || 0;

    var total = T.count, done = 0;
    var queue = [], seen = {}, i;
    [8, 4, 2, 1].forEach(function (stride) {
      for (var k = 0; k < total; k += stride) {
        if (!seen[k]) { seen[k] = 1; queue.push(k); }
      }
    });
    for (i = 0; i < total; i++) { if (!seen[i]) { seen[i] = 1; queue.push(i); } }

    var head = 0, running = 0, concurrency = 6;

    function bump() {
      done++;
      var pct = Math.round((done / total) * 100);
      el.loaderBar.style.width = pct + '%';
      el.loaderPct.textContent = pct;
      if (done >= Math.min(12, total) || done >= total) el.loader.classList.add('is-done');
    }

    function pump() {
      while (running < concurrency && head < queue.length) {
        (function (index) {
          running++;
          var img = new Image();
          img.decoding = 'async';
          img.onload = function () {
            T.images[index] = img;
            T.ready[index] = img.naturalWidth > 0;
            T.dirty = true;
            running--; bump(); pump();
          };
          img.onerror = function () {
            T.images[index] = img;
            T.ready[index] = false;
            if (index === 0 && !T.failed) {
              T.failed = true;
              el.loader.classList.add('is-done');
              showNotice();
            }
            running--; bump(); pump();
          };
          img.src = frameUrl(index);
        })(queue[head++]);
      }
    }
    pump();
  }

  function showNotice() {
    el.notice.innerHTML =
      'Không tải được chuỗi ảnh tại <code>' + frameUrl(0) + '</code><br><br>' +
      'Hãy chạy <code>tools/build-frames.ps1</code> để tạo thư mục <code>frames/</code> ' +
      'từ ảnh gốc trong <code>Sequence1/</code>, rồi tải lại trang.';
    el.notice.hidden = false;
  }

  on(el.canvas, 'wheel', function (e) {
    if (!T.active || T.failed) return;
    e.preventDefault();
    var raw  = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    var step = clamp(raw, -160, 160) * 0.035;
    T.pos += step;
    T.vel  = step * 0.18;
    hideHint();
  }, { passive: false });

  on(el.canvas, 'pointerdown', function (e) {
    if (!T.active || T.failed) return;
    T.dragging = true;
    T.lastX = e.clientX;
    T.vel = 0;
    el.canvas.classList.add('is-dragging');
    try { el.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    hideHint();
  });

  on(el.canvas, 'pointermove', function (e) {
    if (!T.dragging) return;
    var d = -(e.clientX - T.lastX) * 0.35;
    T.lastX = e.clientX;
    T.pos += d;
    T.vel = d;
  });

  function endDrag(e) {
    if (!T.dragging) return;
    T.dragging = false;
    el.canvas.classList.remove('is-dragging');
    try { el.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  on(el.canvas, 'pointerup', endDrag);
  on(el.canvas, 'pointercancel', endDrag);

  /* ==============================================================
     MẶT BẰNG 2D — zoom & pan
     ============================================================== */
  var P = {
    ready: false, src: null,
    s: 1, tx: 0, ty: 0,
    base: 1, min: .2, max: 8,
    dragging: false, lx: 0, ly: 0, moved: false
  };

  function planApply() {
    el.planImage.style.transform =
      'translate3d(' + P.tx + 'px,' + P.ty + 'px,0) scale(' + P.s + ')';
  }

  function planFit() {
    if (!P.ready) return;
    var pad = (CFG.plan && CFG.plan.padding) || 48;
    var vw = el.planView.clientWidth;
    var vh = el.planView.clientHeight;
    var iw = el.planImage.naturalWidth;
    var ih = el.planImage.naturalHeight;
    if (!iw || !ih) return;

    P.base = Math.min((vw - pad * 2) / iw, (vh - pad * 2) / ih);
    P.min  = P.base * ((CFG.plan && CFG.plan.minZoom) || 0.4);
    P.max  = P.base * ((CFG.plan && CFG.plan.maxZoom) || 8);
    P.s    = P.base;
    P.tx   = (vw - iw * P.s) / 2;
    P.ty   = (vh - ih * P.s) / 2;
    planApply();
  }

  function planZoomAt(px, py, k) {
    var ns = clamp(P.s * k, P.min, P.max);
    if (ns === P.s) return;
    P.tx = px - (px - P.tx) * (ns / P.s);
    P.ty = py - (py - P.ty) * (ns / P.s);
    P.s  = ns;
    planApply();
  }

  function planZoomCenter(k) {
    planZoomAt(el.planView.clientWidth / 2, el.planView.clientHeight / 2, k);
  }

  function setPlanSrc(src) {
    if (P.src === src && P.ready) { planFit(); return; }
    P.src = src;
    P.ready = false;
    el.planImage.onload = function () { P.ready = true; planFit(); };
    el.planImage.src = src;
  }

  on(el.planView, 'wheel', function (e) {
    if (!P.ready) return;
    e.preventDefault();
    var r = el.planView.getBoundingClientRect();
    planZoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
    hideHint();
  }, { passive: false });

  on(el.planView, 'pointerdown', function (e) {
    if (!P.ready) return;
    P.dragging = true; P.moved = false;
    P.lx = e.clientX; P.ly = e.clientY;
    el.planView.classList.add('is-dragging');
    try { el.planView.setPointerCapture(e.pointerId); } catch (_) {}
    hideHint();
  });

  on(el.planView, 'pointermove', function (e) {
    if (!P.dragging) return;
    P.tx += e.clientX - P.lx;
    P.ty += e.clientY - P.ly;
    P.lx = e.clientX; P.ly = e.clientY;
    P.moved = true;
    planApply();
  });

  function endPan(e) {
    if (!P.dragging) return;
    P.dragging = false;
    el.planView.classList.remove('is-dragging');
    try { el.planView.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  on(el.planView, 'pointerup', endPan);
  on(el.planView, 'pointercancel', endPan);
  on(el.planView, 'dblclick', function () { planFit(); });

  /* ==============================================================
     GỢI Ý THAO TÁC
     ============================================================== */
  var hintTimer = null;
  function showHint(text) {
    if (!el.hint) return;
    el.hintText.textContent = text || '';
    el.hint.classList.remove('is-hidden');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 8000);
  }
  function hideHint() {
    if (!el.hint) return;
    el.hint.classList.add('is-hidden');
    clearTimeout(hintTimer);
  }

  /* ==============================================================
     ĐIỀU HƯỚNG KHÔNG GIAN
     ============================================================== */
  var state = { id: null, lastByMode: { '360': null, '2d': null, 'pano': null } };

  function sceneById(id) {
    for (var i = 0; i < SCENES.length; i++) { if (SCENES[i].id === id) return SCENES[i]; }
    return null;
  }
  function firstOfMode(mode) {
    for (var i = 0; i < SCENES.length; i++) { if (SCENES[i].mode === mode) return SCENES[i]; }
    return null;
  }

  /* Các ảnh cùng một chế độ xem (NỘI THẤT 2D hoặc NỘI THẤT 360) */
  function scenesOfMode(mode) {
    return SCENES.filter(function (s) { return s.mode === mode; });
  }

  /* Chuyển sang ảnh kế trước/kế sau trong cùng chế độ xem */
  function stepScene(dir) {
    var sc = state.id ? sceneById(state.id) : null;
    if (!sc) return;
    var list = scenesOfMode(sc.mode);
    if (list.length < 2) return;
    var i = 0;
    for (var k = 0; k < list.length; k++) { if (list[k].id === sc.id) { i = k; break; } }
    setScene(list[(i + dir + list.length) % list.length].id);
  }

  function setScene(id, isFirst) {
    var sc = sceneById(id) || SCENES[0];
    if (!sc) return;
    state.id = sc.id;
    state.lastByMode[sc.mode] = sc.id;

    var isFrames = sc.mode === '360';
    var isPlan   = sc.mode === '2d';
    var isPano   = sc.mode === 'pano';

    el.sceneIdx.textContent  = pad(SCENES.indexOf(sc) + 1, 2);
    el.sceneName.textContent = sc.name;
    document.title = sc.name + (CFG.brand ? ' — ' + CFG.brand : '');

    [].forEach.call(el.modebar.children, function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-mode') === sc.mode));
    });

    T.active = isFrames;
    el.canvas.hidden   = !isFrames;
    el.planView.hidden = !isPlan;
    el.panoView.hidden = !isPano;
    if (!isPano && PANO.live) PANO.live = false;

    var spinBtn = el.toolbar.querySelector('[data-tool="spin"]');
    if (spinBtn) {
      spinBtn.disabled = !isFrames;
      if (!isFrames && T.spin) setSpin(false);
    }

    /* Cụm nút chuyển ảnh chỉ hiện khi chế độ xem hiện tại có từ 2 ảnh */
    if (el.imgbar) {
      var hasNav = scenesOfMode(sc.mode).length >= 2;
      el.imgbar.hidden = !hasNav;
      document.body.classList.toggle('has-imgbar', hasNav);
    }

    if (isFrames) {
      showHint((CFG.hints || {})['360']);
      loadSequence();
      T.dirty = true;
    } else if (isPlan) {
      showHint((CFG.hints || {})['2d']);
      setPlanSrc(sc.src);
    } else {
      showHint((CFG.hints || {})['pano']);
      showPano(sc);
    }

    updateDrawerActive();
    if (!isFirst) {
      try { history.replaceState(null, '', '#' + sc.id); } catch (_) {}
    }
  }

  /* ==============================================================
     TOÀN CẢNH 360° — Pannellum (pannellum.org)
     ============================================================== */
  var PANO = { viewer: null, live: false };

  /* Cấu hình nhiều cảnh cho Pannellum: mỗi ảnh nội thất là một scene */
  function panoConfig(firstId) {
    var o = CFG.pano || {};
    var scenes = {};
    scenesOfMode('pano').forEach(function (s) {
      scenes[s.id] = {
        type: 'equirectangular',
        panorama: s.src,
        hfov: o.hfov || 100,
        pitch: o.pitch || 0,
        yaw: o.yaw || 0
      };
    });
    return {
      default: {
        firstScene: firstId,
        autoLoad: true,
        autoRotate: o.autoRotate || 0,
        showControls: o.showControls !== false,
        sceneFadeDuration: 500
      },
      scenes: scenes
    };
  }

  function showPano(sc) {
    if (!window.pannellum) {
      el.notice.innerHTML =
        'Không tải được thư viện <code>Pannellum</code> từ CDN.<br><br>' +
        'Cần kết nối mạng, hoặc tải <code>pannellum.js</code> / <code>pannellum.css</code> ' +
        'về đặt trong thư mục dự án rồi trỏ lại trong <code>index.html</code>.';
      el.notice.hidden = false;
      return;
    }
    el.notice.hidden = true;

    /* Đang ở sẵn khung 360° thì chỉ chuyển sang cảnh mới */
    if (PANO.viewer && PANO.live) {
      PANO.viewer.loadScene(sc.id);
      return;
    }

    /* Vừa quay lại từ chế độ khác: khung đã bị ẩn nên phải dựng lại */
    if (PANO.viewer) {
      PANO.viewer.destroy();
      PANO.viewer = null;
      el.panoView.innerHTML = '';
    }
    PANO.viewer = window.pannellum.viewer('panoView', panoConfig(sc.id));
    PANO.live = true;
  }

  /* ==============================================================
     MENU (drawer)
     ============================================================== */
  function buildDrawer() {
    SCENES.forEach(function (sc, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene';
      b.setAttribute('data-scene', sc.id);

      var thumb = document.createElement('img');
      thumb.className = 'scene__thumb';
      thumb.alt = '';
      thumb.draggable = false;
      if (sc.thumb) thumb.src = sc.thumb;

      var body = document.createElement('span');
      body.className = 'scene__body';
      var no = document.createElement('span');
      no.className = 'scene__no';
      no.textContent = pad(i + 1, 2);
      var nm = document.createElement('span');
      nm.className = 'scene__name';
      nm.textContent = sc.name;
      var sub = document.createElement('span');
      sub.className = 'scene__sub';
      sub.textContent = sc.subtitle || '';
      body.appendChild(no); body.appendChild(nm); body.appendChild(sub);

      var badge = document.createElement('span');
      badge.className = 'scene__badge';
      badge.textContent = MODE_LABEL[sc.mode] || '';

      b.appendChild(thumb); b.appendChild(body); b.appendChild(badge);
      b.addEventListener('click', function () { setScene(sc.id); closeDrawer(); });
      el.drawerList.appendChild(b);
    });
  }

  function updateDrawerActive() {
    [].forEach.call(el.drawerList.children, function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-scene') === state.id);
    });
  }

  function openDrawer() {
    el.scrim.hidden = false;
    void el.scrim.offsetWidth;
    el.scrim.classList.add('is-open');
    el.drawer.classList.add('is-open');
    el.drawer.setAttribute('aria-hidden', 'false');
    el.menuBtn.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    el.scrim.classList.remove('is-open');
    el.drawer.classList.remove('is-open');
    el.drawer.setAttribute('aria-hidden', 'true');
    el.menuBtn.setAttribute('aria-expanded', 'false');
    setTimeout(function () { if (!el.drawer.classList.contains('is-open')) el.scrim.hidden = true; }, 360);
  }

  /* ==============================================================
     TỰ ĐỘNG XOAY
     ============================================================== */
  function setSpin(on) {
    T.spin = !!on;
    var btn = el.toolbar.querySelector('[data-tool="spin"]');
    if (btn) {
      btn.classList.toggle('is-active', T.spin);
      btn.setAttribute('aria-pressed', String(T.spin));
    }
  }

  /* ==============================================================
     KHỞI TẠO
     ============================================================== */
  function init() {
    if (CFG.title) document.title = CFG.title;

    buildDrawer();
    resizeCanvas();

    on(el.menuBtn, 'click', function () {
      el.drawer.classList.contains('is-open') ? closeDrawer() : openDrawer();
    });
    on(el.drawerClose, 'click', closeDrawer);
    on(el.scrim, 'click', closeDrawer);

    on(el.modebar, 'click', function (e) {
      var b = e.target.closest('.mode');
      if (!b) return;
      var mode = b.getAttribute('data-mode');
      var target = state.lastByMode[mode] || (firstOfMode(mode) && firstOfMode(mode).id);
      if (target) setScene(target);
    });

    on(el.toolbar, 'click', function (e) {
      var b = e.target.closest('.toolbar__btn');
      if (!b || b.disabled) return;
      var tool = b.getAttribute('data-tool');
      if (tool === 'plan') {
        var t = state.lastByMode['2d'] || (firstOfMode('2d') && firstOfMode('2d').id);
        if (t) setScene(t);
      } else if (tool === 'spin') {
        if (state.id && sceneById(state.id).mode !== '360') {
          var f = firstOfMode('360');
          if (f) setScene(f.id);
        }
        setSpin(!T.spin);
        hideHint();
      }
    });

    on(el.imgbar, 'click', function (e) {
      var b = e.target.closest('.nav-btn');
      if (!b) return;
      stepScene(parseInt(b.getAttribute('data-nav'), 10) || 0);
      hideHint();
    });

    on(window, 'keydown', function (e) {
      if (e.key === 'Escape') { closeDrawer(); return; }
      var sc = state.id ? sceneById(state.id) : null;
      if (!sc) return;
      if (sc.mode === '360' && !T.failed) {
        if (e.key === 'ArrowLeft')  { T.pos -= 2; T.vel = 0; setSpin(false); hideHint(); }
        if (e.key === 'ArrowRight') { T.pos += 2; T.vel = 0; setSpin(false); hideHint(); }
      } else if (sc.mode === '2d' && P.ready) {
        if (e.key === '+' || e.key === '=') planZoomCenter(1.25);
        if (e.key === '-' || e.key === '_') planZoomCenter(1 / 1.25);
        if (e.key === '0') planFit();
      }
    });

    var rzTimer = null;
    on(window, 'resize', function () {
      clearTimeout(rzTimer);
      rzTimer = setTimeout(function () {
        resizeCanvas();
        if (!el.planView.hidden) planFit();
      }, 160);
    });

    requestAnimationFrame(tick);

    var start = (location.hash || '').replace(/^#/, '');
    if (!sceneById(start)) start = SCENES.length ? SCENES[0].id : null;
    if (start) {
      setScene(start, true);
      if (sceneById(start).mode !== '360') el.loader.classList.add('is-done');
    } else {
      el.loader.classList.add('is-done');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
