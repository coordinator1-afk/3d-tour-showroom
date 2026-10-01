/* =====================================================================
   scenes.js — CẤU HÌNH NỘI DUNG
   Chỉnh sửa file này để thêm/bớt không gian, đổi tên, đổi ảnh.
   ===================================================================== */

window.SITE_CONFIG = {
  /* Tiêu đề hiển thị trên tab trình duyệt */
  title: 'TỔNG THỂ — Tham quan 3D',

  /* Thương hiệu nhỏ ở góc trên bên phải */
  brand: 'VIETNAM',

  /* -------------------------------------------------------------------
     Chuỗi ảnh xoay 360° (turntable) — "cuộn để xoay"
     Ảnh gốc: Sequence1/Sequence1_000.png ... Sequence1_249.png
     Được chuyển sang: frames/{w}/frame_000.webp ... frame_249.webp
     (chạy tools/build-frames.ps1 để tạo lại)
     ------------------------------------------------------------------- */
  frames: {
    count: 250,                                   // số frame
    start: 0,                                     // số thứ tự frame đầu
    pad: 3,                                       // độ dài phần số: 000
    template: 'frames/{w}/frame_{i}.webp',        // {w} = bề rộng, {i} = số frame
    sizes: [1920, 1280, 960]                      // các bộ kích thước đã tạo
  },

  /* Bề rộng tối đa / tối thiểu của khung nhìn */
  plan: {
    minZoom: 0.4,     // hệ số zoom nhỏ nhất so với vừa khung
    maxZoom: 8,       // hệ số zoom lớn nhất so với vừa khung
    padding: 48       // khoảng đệm khi tự căn vừa khung (px)
  },

  /* Toàn cảnh 360° — dùng thư viện Pannellum (pannellum.org) */
  pano: {
    hfov: 100,        // góc nhìn ngang ban đầu (độ)
    pitch: 0,         // góc ngẩng ban đầu
    yaw: 0,           // hướng nhìn ban đầu
    autoRotate: -2,   // tốc độ tự xoay (độ/giây), 0 = tắt
    showControls: false // thanh điều khiển mặc định của Pannellum (zoom, toàn màn hình...)
  },

  /* -------------------------------------------------------------------
     DANH SÁCH KHÔNG GIAN
     mode: '360'  -> xem chuỗi frame (cuộn/drag để xoay)
     mode: '2d'   -> xem bản vẽ mặt bằng (lăn để zoom, kéo để di chuyển)
     ------------------------------------------------------------------- */
  scenes: [
    {
      id: 'tong-the',
      name: 'TỔNG THỂ',
      subtitle: 'Toàn cảnh tòa nhà',
      mode: '360',
      type: 'frames',
      thumb: 'frames/1920/frame_000.webp'
    },
    {
      id: 'mat-bang-01',
      name: 'MẶT BẰNG 01',
      subtitle: 'Bản vẽ mặt bằng',
      mode: '2d',
      type: 'plan',
      src: 'assets/2d/plan-01.jpg',
      thumb: 'assets/2d/plan-01.jpg'
    },
    {
      id: 'mat-bang-02',
      name: 'MẶT BẰNG 02',
      subtitle: 'Bản vẽ mặt bằng',
      mode: '2d',
      type: 'plan',
      src: 'assets/2d/plan-02.jpg',
      thumb: 'assets/2d/plan-02.jpg'
    },
    {
      id: 'ban-ve-03',
      name: 'BẢN VẼ 03',
      subtitle: 'Chi tiết kỹ thuật',
      mode: '2d',
      type: 'plan',
      src: 'assets/2d/plan-03.jpg',
      thumb: 'assets/2d/plan-03.jpg'
    },
    {
      id: 'noi-that-01',
      name: 'NỘI THẤT',
      subtitle: 'Không gian nội thất',
      mode: '2d',
      type: 'plan',
      src: 'assets/2d/plan-04.jpg',
      thumb: 'assets/2d/plan-04.jpg'
    },
    {
      id: 'noi-that-360-01',
      name: 'NỘI THẤT 01',
      subtitle: 'Toàn cảnh 360°',
      mode: 'pano',
      type: 'pano',
      src: 'assets/pano/pano-01.jpg',
      thumb: 'assets/pano/pano-01.jpg'
    },
    {
      id: 'noi-that-360-02',
      name: 'NỘI THẤT 02',
      subtitle: 'Toàn cảnh 360°',
      mode: 'pano',
      type: 'pano',
      src: 'assets/pano/pano-02.jpg',
      thumb: 'assets/pano/pano-02.jpg'
    },
    {
      id: 'noi-that-360-03',
      name: 'NỘI THẤT 03',
      subtitle: 'Toàn cảnh 360°',
      mode: 'pano',
      type: 'pano',
      src: 'assets/pano/pano-03.jpg',
      thumb: 'assets/pano/pano-03.jpg'
    },
    {
      id: 'noi-that-360-04',
      name: 'NỘI THẤT 04',
      subtitle: 'Toàn cảnh 360°',
      mode: 'pano',
      type: 'pano',
      src: 'assets/pano/pano-04.jpg',
      thumb: 'assets/pano/pano-04.jpg'
    },
    {
      id: 'noi-that-360-05',
      name: 'NỘI THẤT 05',
      subtitle: 'Toàn cảnh 360°',
      mode: 'pano',
      type: 'pano',
      src: 'assets/pano/pano-05.jpg',
      thumb: 'assets/pano/pano-05.jpg'
    },
    {
      id: 'noi-that-360-06',
      name: 'NỘI THẤT 06',
      subtitle: 'Toàn cảnh 360°',
      mode: 'pano',
      type: 'pano',
      src: 'assets/pano/pano-06.jpg',
      thumb: 'assets/pano/pano-06.jpg'
    }
  ],

  /* -------------------------------------------------------------------
     HOTSPOT trên cảnh ngoại cảnh (khối line box phát sáng, bấm để vào nội thất)
     Toàn bộ hotspot (vị trí từng frame, tên, cảnh sẽ mở) nằm trong js/hotspots.json,
     chỉnh bằng tools/hotspot-editor.html (xem README).
     ------------------------------------------------------------------- */
  hotspotsData: 'js/hotspots.json',

  /* Minimap vị trí camera trong các cảnh 360° nội thất (đặt bằng tools/camera-editor.html) */
  camerasData: 'js/cameras.json',

  /* Chữ gợi ý trên màn hình */
  hints: {
    '360': 'CUỘN ĐỂ XOAY',
    '2d': 'LĂN ĐỂ ZOOM · KÉO ĐỂ DI CHUYỂN',
    'pano': 'KÉO ĐỂ XOAY · LĂN ĐỂ ZOOM'
  }
};
