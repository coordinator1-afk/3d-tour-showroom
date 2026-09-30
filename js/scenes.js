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
    }
  ],

  /* Chữ gợi ý trên màn hình */
  hints: {
    '360': 'CUỘN ĐỂ XOAY',
    '2d': 'LĂN ĐỂ ZOOM · KÉO ĐỂ DI CHUYỂN'
  }
};
