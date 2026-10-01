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
  var MODE_LABEL = { '360': 'EXTERIOR', '2d': 'INTERIOR', 'pano': 'INTERIOR 360' };

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

    T.map = { sx: sx, sy: sy, sw: sw, sh: sh, iw: iw, ih: ih };
    drawHotspots(use);

    T.lastDrawn = use;
    T.dirty = false;
  }

  /* ==============================================================
     HOTSPOT — khối line box phát sáng bám theo căn hộ
     Toạ độ từng frame nằm trong js/hotspots.json (tạo bằng tools/track-hotspot.py),
     chuẩn hoá 0..1 theo khung ảnh nên đúng với mọi bộ kích thước frame.
     ============================================================== */
  var H = { items: [], hover: null, open: null, any: false, card: null, down: null, tip: null };

  function loadHotspots() {
    if (!window.fetch) return;
    fetch(CFG.hotspotsData || 'js/hotspots.json').then(function (r) { return r.json(); }).then(function (all) {
      Object.keys(all).forEach(function (id) {
        var d = all[id];
        if (!d || !d.frames) return;
        H.items.push({
          cfg: { id: id, name: d.name || id, link: d.link || '' },
          frames: d.frames, screen: null
        });
      });
      T.dirty = true;
    }).catch(function () {});
  }

  function hotspotPoly(it, idx) {
    var d = it.frames[pad(idx, FRAMES.pad || 3)];
    if (!d || !d.v) return null;
    var m = T.map, p = d.p, k = T.w / m.sw, out = [];
    for (var i = 0; i < p.length; i += 2) {
      out.push([(p[i] * m.iw - m.sx) * k, (p[i + 1] * m.ih - m.sy) * (T.h / m.sh)]);
    }
    return out;
  }

  function pointInPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function drawHotspots(frameIdx) {
    H.any = false;
    if (!H.items.length) return;
    var t = performance.now() / 1000;
    var pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    H.items.forEach(function (it) {
      var poly = hotspotPoly(it, frameIdx);
      it.screen = poly;
      if (!poly) return;
      H.any = true;
      var hot = H.hover === it || H.open === it;

      ctx.save();
      ctx.beginPath();
      poly.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.fillStyle = 'rgba(80, 200, 255, ' + (hot ? 0.34 : 0.10 + 0.12 * pulse) + ')';
      ctx.fill();
      ctx.shadowColor = 'rgba(90, 210, 255, 0.95)';
      ctx.shadowBlur = hot ? 26 : 10 + 14 * pulse;
      ctx.strokeStyle = hot ? '#ffffff' : 'rgba(190, 240, 255, ' + (0.75 + 0.25 * pulse) + ')';
      ctx.lineWidth = hot ? 2.6 : 2;
      ctx.stroke();
      ctx.stroke();                         // vẽ 2 lần để viền phát sáng đậm hơn
      ctx.restore();
    });
    if (H.any) T.dirty = true;              // giữ hiệu ứng nhịp sáng
    placeCard();
  }

  function hotspotAt(x, y) {
    for (var i = 0; i < H.items.length; i++) {
      var s = H.items[i].screen;
      if (s && pointInPoly(x, y, s)) return H.items[i];
    }
    return null;
  }

  function showTip(it, x, y) {
    if (!H.tip) {
      H.tip = document.createElement('div');
      H.tip.className = 'hotspot-tip';
      H.tip.hidden = true;
      el.canvas.parentNode.appendChild(H.tip);
    }
    if (!it || H.open) { H.tip.hidden = true; return; }
    H.tip.textContent = it.cfg.name;
    H.tip.style.left = x + 'px';
    H.tip.style.top = (y - 16) + 'px';
    H.tip.hidden = false;
  }

  function buildCard() {
    var c = document.createElement('div');
    c.className = 'hotspot-card';
    c.hidden = true;
    c.innerHTML =
      '<span class="hotspot-card__name"></span>' +
      '<button class="hotspot-card__go" type="button">VIEW INTERIOR <i>→</i></button>';
    el.canvas.parentNode.appendChild(c);
    c.querySelector('.hotspot-card__go').addEventListener('click', function () {
      var it = H.open;
      closeCard();
      if (it && it.cfg.link) setScene(it.cfg.link);
    });
    c.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    H.card = c;
  }

  function openCard(it) {
    if (!H.card) buildCard();
    H.open = it;
    if (H.tip) H.tip.hidden = true;
    H.card.querySelector('.hotspot-card__name').textContent = it.cfg.name || '';
    H.card.hidden = false;
    setSpin(false);
    T.dirty = true;
  }

  function closeCard() {
    H.open = null;
    if (H.card) H.card.hidden = true;
    T.dirty = true;
  }

  function placeCard() {
    if (!H.open) return;
    var s = H.open.screen;
    if (!s) { closeCard(); return; }       // căn đã xoay khuất → đóng thẻ
    var cx = 0, top = Infinity;
    s.forEach(function (q) { cx += q[0]; top = Math.min(top, q[1]); });
    cx /= s.length;
    H.card.style.left = clamp(cx, 90, T.w - 90) + 'px';
    H.card.style.top  = Math.max(top - 14, 70) + 'px';
  }

  function tick() {
    requestAnimationFrame(tick);
    minimapTick();
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
      'Could not load the image sequence at <code>' + frameUrl(0) + '</code><br><br>' +
      'Run <code>tools/build-frames.ps1</code> to create the <code>frames/</code> folder ' +
      'from the source images in <code>Sequence1/</code>, then reload the page.';
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
    H.down = { x: e.clientX, y: e.clientY };
    el.canvas.classList.add('is-dragging');
    try { el.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    hideHint();
  });

  on(el.canvas, 'pointermove', function (e) {
    if (!T.dragging) {
      var hv = hotspotAt(e.clientX, e.clientY);
      if (hv !== H.hover) {
        H.hover = hv;
        el.canvas.style.cursor = hv ? 'pointer' : '';
        T.dirty = true;
      }
      showTip(hv, e.clientX, e.clientY);
      return;
    }
    if (e.buttons === 0 && e.pointerType === 'mouse') { endDrag(e); return; }   // mất pointerup → thôi kéo
    var d = -(e.clientX - T.lastX) * 0.35;
    T.lastX = e.clientX;
    T.pos += d;
    T.vel = d;
  });

  function endDrag(e) {
    if (!T.dragging) return;
    T.dragging = false;
    /* nhấp (không kéo) vào hotspot → mở thẻ; nhấp ra ngoài → đóng thẻ */
    if (e.type === 'pointerup' && H.down &&
        Math.abs(e.clientX - H.down.x) < 5 && Math.abs(e.clientY - H.down.y) < 5) {
      var hit = hotspotAt(e.clientX, e.clientY);
      if (hit) openCard(hit); else if (H.open) closeCard();
    } else if (H.open) {
      closeCard();
    }
    H.down = null;
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
    closeCard();

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

    if (!isFrames && T.spin) setSpin(false);

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
    updateMinimapScene();
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
        'Could not load the <code>Pannellum</code> library from the CDN.<br><br>' +
        'An internet connection is required, or download <code>pannellum.js</code> / <code>pannellum.css</code> ' +
        'into the project folder and point to them in <code>index.html</code>.';
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
     MINIMAP — vị trí camera + hướng nhìn trên mặt bằng (cảnh 360° nội thất)
     Dữ liệu: js/cameras.json  { plan, cams: { <id cảnh>: { x, y, rot } } }  (x,y chuẩn hoá 0..1)
     Hình quạt xoay theo hướng nhìn, độ mở bằng góc nhìn (hfov) nên zoom vào/ra thì quạt hẹp/rộng.
     ============================================================== */
  var MM = { data: null, box: null, img: null, cone: null, path: null, dot: null, dots: [], id: null, lastKey: '', R: 52,
             level: 1, hidden: false, toggle: null, scale: 1 };
  var MM_WIDTHS = [130, 200, 300, 440];          // các cỡ minimap (px), phóng to / thu nhỏ theo nấc

  function mmStore(k, v) {
    try { if (v === undefined) return localStorage.getItem('mm_' + k); localStorage.setItem('mm_' + k, v); } catch (_) {}
    return null;
  }

  function loadCameras() {
    if (!window.fetch) return;
    fetch(CFG.camerasData || 'js/cameras.json').then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.cams) return;
      MM.data = d;
      buildMinimap();
      updateMinimapScene();
    }).catch(function () {});
  }

  function buildMinimap() {
    var b = document.createElement('div');
    b.className = 'minimap';
    b.hidden = true;
    b.innerHTML =
      '<img class="minimap__img" alt="Floor plan" draggable="false">' +
      '<svg class="minimap__cone" width="' + MM.R * 2 + '" height="' + MM.R * 2 + '" viewBox="0 0 ' + MM.R * 2 + ' ' + MM.R * 2 + '">' +
        '<defs><radialGradient id="mmGrad" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0" stop-color="#5ad2ff" stop-opacity=".95"/><stop offset="1" stop-color="#5ad2ff" stop-opacity="0"/>' +
        '</radialGradient></defs><path fill="url(#mmGrad)"/></svg>' +
      '<i class="minimap__dot"></i>' +
      '<div class="minimap__bar">' +
        '<button type="button" data-mm="out" aria-label="Zoom out minimap">−</button>' +
        '<button type="button" data-mm="in" aria-label="Zoom in minimap">+</button>' +
        '<button type="button" data-mm="hide" aria-label="Hide minimap">✕</button>' +
      '</div>';
    el.canvas.parentNode.appendChild(b);

    var t = document.createElement('button');
    t.type = 'button';
    t.className = 'minimap-toggle';
    t.hidden = true;
    t.setAttribute('aria-label', 'Show minimap');
    t.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Zm0 0v13m6-10v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    el.canvas.parentNode.appendChild(t);
    MM.toggle = t;

    var lv = parseInt(mmStore('level'), 10);
    if (lv >= 0 && lv < MM_WIDTHS.length) MM.level = lv;
    MM.hidden = mmStore('hidden') === '1';

    b.querySelector('.minimap__bar').addEventListener('click', function (e) {
      var a = e.target.closest('button');
      if (!a) return;
      var act = a.getAttribute('data-mm');
      if (act === 'in')  MM.level = Math.min(MM_WIDTHS.length - 1, MM.level + 1);
      if (act === 'out') MM.level = Math.max(0, MM.level - 1);
      if (act === 'hide') MM.hidden = true;
      mmStore('level', String(MM.level));
      mmStore('hidden', MM.hidden ? '1' : '0');
      applyMinimapSize();
    });
    t.addEventListener('click', function () {
      MM.hidden = false;
      mmStore('hidden', '0');
      applyMinimapSize();
    });
    on(window, 'resize', applyMinimapSize);
    MM.box = b;
    MM.img = b.querySelector('.minimap__img');
    MM.cone = b.querySelector('.minimap__cone');
    MM.path = b.querySelector('path');
    MM.dot = b.querySelector('.minimap__dot');
    MM.img.src = MM.data.plan;
  }

  /* cỡ minimap + ẩn/hiện */
  function applyMinimapSize() {
    if (!MM.box) return;
    var sc = state.id ? sceneById(state.id) : null;
    var avail = !!(sc && sc.mode === 'pano' && MM.data.cams[sc.id]);
    var w = Math.min(MM_WIDTHS[MM.level], Math.round(window.innerWidth * 0.62), Math.round(window.innerHeight * 0.62 * 1.08));
    MM.box.style.width = w + 'px';
    MM.scale = w / 200;
    MM.cone.style.width = MM.cone.style.height = (MM.R * 2 * MM.scale) + 'px';
    MM.box.hidden = !avail || MM.hidden;
    MM.toggle.hidden = !avail || !MM.hidden;
    var bar = MM.box.querySelector('.minimap__bar');
    bar.querySelector('[data-mm="out"]').disabled = MM.level === 0;
    bar.querySelector('[data-mm="in"]').disabled = MM.level === MM_WIDTHS.length - 1;
    MM.lastKey = '';
    minimapTick();
  }

  function mmPlace(node, c) {
    node.style.left = (c.x * 100) + '%';
    node.style.top = (c.y * 100) + '%';
  }

  function updateMinimapScene() {
    if (!MM.box) return;
    var sc = state.id ? sceneById(state.id) : null;
    var c = sc && MM.data.cams[sc.id];
    MM.id = c ? sc.id : null;
    applyMinimapSize();
    if (!c || !sc || sc.mode !== 'pano') return;

    mmPlace(MM.cone, c);
    mmPlace(MM.dot, c);

    /* các camera khác: chấm nhỏ, bấm để sang cảnh đó */
    MM.dots.forEach(function (d) { d.remove(); });
    MM.dots = [];
    Object.keys(MM.data.cams).forEach(function (id) {
      if (id === sc.id || !sceneById(id)) return;
      var o = document.createElement('button');
      o.type = 'button';
      o.className = 'minimap__other';
      o.title = sceneById(id).name;
      mmPlace(o, MM.data.cams[id]);
      o.addEventListener('click', function () { setScene(id); });
      MM.box.appendChild(o);
      MM.dots.push(o);
    });
    MM.lastKey = '';
    minimapTick();
  }

  /* gọi mỗi khung hình: đọc hướng nhìn & góc nhìn từ Pannellum */
  function minimapTick() {
    if (!MM.box || MM.box.hidden || !PANO.viewer || !PANO.live) return;
    var c = MM.data.cams[MM.id];
    if (!c) return;
    var yaw = PANO.viewer.getYaw(), hfov = PANO.viewer.getHfov();
    var key = yaw.toFixed(1) + '|' + hfov.toFixed(1);
    if (key === MM.lastKey) return;
    MM.lastKey = key;

    var R = MM.R, h = clamp(hfov, 15, 140) * Math.PI / 360;       // nửa góc mở (rad)
    var x1 = R + R * Math.sin(-h), y1 = R - R * Math.cos(h);
    var x2 = R + R * Math.sin(h);
    MM.path.setAttribute('d', 'M' + R + ',' + R + ' L' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 0 1 ' + x2 + ',' + y1 + ' Z');
    MM.cone.style.transform = 'translate(-50%,-50%) rotate(' + (yaw + (c.rot || 0)) + 'deg)';
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
  }

  /* ==============================================================
     KHỞI TẠO
     ============================================================== */
  function init() {
    if (CFG.title) document.title = CFG.title;

    buildDrawer();
    resizeCanvas();
    loadHotspots();
    loadCameras();

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

    on(el.imgbar, 'click', function (e) {
      var b = e.target.closest('.nav-btn');
      if (!b) return;
      stepScene(parseInt(b.getAttribute('data-nav'), 10) || 0);
      hideHint();
    });

    on(window, 'keydown', function (e) {
      if (e.key === 'Escape') { closeDrawer(); closeCard(); return; }
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
