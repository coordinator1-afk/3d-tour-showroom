# Tham quan 3D — TỔNG THỂ

Website tĩnh (HTML/CSS/JS thuần, không cần build) hiển thị:

- **VIEW 360** — cảnh toàn cảnh tòa nhà dạng **chuỗi ảnh xoay (turntable)**: cuộn chuột hoặc kéo để xoay 360°.
- **VIEW 2D** — bản vẽ **mặt bằng 2D**: lăn để zoom, kéo để di chuyển.

Giao diện dựng theo ảnh thiết kế `Mat bang.png`: nút **MENU** góc trái trên, thanh công cụ dọc bên phải, thanh chuyển chế độ **VIEW 360 / VIEW 2D** ở giữa dưới, tông nền đen-xanh ô-liu với accent đất nung.

---

## 1. Cấu trúc thư mục

```
.
├── index.html            # Trang chính
├── css/style.css         # Toàn bộ giao diện
├── js/
│   ├── scenes.js         # ⭐ CẤU HÌNH: danh sách không gian, tên, đường dẫn ảnh
│   └── app.js            # Trình xem frame + mặt bằng 2D + menu
├── assets/
│   ├── ui/               # Icon giao diện (menu.png, group35.png, viewbar.png)
│   └── 2d/               # Ảnh mặt bằng 2D (plan-01/02/03.jpg)
├── frames/               # Chuỗi frame đã nén WebP
│   ├── 1920/frame_000.webp ... frame_249.webp
│   ├── 1280/...
│   └── 960/...
├── tools/build-frames.ps1  # Script chuyển PNG -> WebP nhiều kích thước
├── Sequence1/            # (không đẩy lên git) 250 ảnh PNG gốc
└── 2d/                   # (không đẩy lên git) ảnh mặt bằng gốc
```

---

## 2. Chạy thử ở máy

Cần chạy qua HTTP (không mở trực tiếp `file://` vì trình duyệt chặn việc tải ảnh frame):

```powershell
python -m http.server 8123
# rồi mở http://localhost:8123/
```

Hoặc dùng `npx serve .` nếu có Node.js.

---

## 3. Thao tác

| Khu vực | Chức năng |
|---|---|
| Cuộn chuột / kéo ngang | Xoay cảnh 360° (có quán tính) |
| Phím `←` `→` | Xoay từng bước |
| Icon thứ 2 trên thanh phải | Bật/tắt tự động xoay |
| Icon thứ 1 trên thanh phải | Chuyển sang mặt bằng 2D |
| **MENU** (trái trên) | Mở danh mục không gian |
| **VIEW 360 / VIEW 2D** | Chuyển chế độ xem |
| Trong 2D: lăn / kéo | Zoom theo con trỏ / di chuyển bản vẽ |
| Trong 2D: `+` `-` `0` | Zoom in / zoom out / căn vừa khung |
| `Esc` | Đóng menu |

Trạng thái không gian được đồng bộ lên URL, ví dụ `.../#mat-bang-01` — có thể gửi link trực tiếp.

---

## 4. Chỉnh sửa nội dung

Mở `js/scenes.js`, sửa mảng `scenes`:

```js
{
  id: 'mat-bang-02',       // dùng cho URL #mat-bang-02
  name: 'MẶT BẰNG 02',     // tên hiển thị
  subtitle: 'Bản vẽ mặt bằng',
  mode: '2d',              // '2d' hoặc '360'
  type: 'plan',
  src: 'assets/2d/plan-02.jpg',
  thumb: 'assets/2d/plan-02.jpg'
}
```

- Thêm ảnh mặt bằng mới: bỏ file vào `assets/2d/` rồi thêm một mục `mode: '2d'` như trên.
- Đổi gợi ý thao tác: xem `hints` trong cùng file.

---

## 5. Tạo lại chuỗi frame (khi thay ảnh gốc)

1. Đặt 250 ảnh PNG vào `Sequence1/` với tên `Sequence1_000.png` … `Sequence1_249.png`.
2. Chạy (cần **ffmpeg** trong PATH):

```powershell
powershell -ExecutionPolicy Bypass -File tools\build-frames.ps1
```

Script xuất ra 3 bộ WebP (`frames/1920`, `frames/1280`, `frames/960`). Khi tải trang, JavaScript tự chọn bộ nhỏ nhất đủ nét theo kích thước màn hình, nhờ đó giảm dung lượng đáng kể (700 MB PNG → khoảng 46 MB WebP).

Muốn đổi số frame, sửa `count` và `pad` trong `js/scenes.js` cho khớp.

---

## 6. Triển khai (deploy)

### 6.1. GitHub

Repo: <https://github.com/coordinator1-afk/3d-tour-showroom>

`Sequence1/` (700 MB ảnh PNG gốc) và thư mục `2d/` đã được `.gitignore` bỏ qua — chỉ bản WebP trong `frames/` (≈46 MB) được đẩy lên.

```bash
git add .
git commit -m "cap nhat noi dung"
git push
```

### 6.2. Cloudflare Pages

Site đang chạy tại: **<https://3d-tour-showroom.pages.dev>**

Vì thư mục gốc còn chứa 700 MB ảnh nguồn, ta deploy từ gói rút gọn `dist/`:

```powershell
# 1. Tạo lại gói deploy (chỉ gồm file website cần thiết)
Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path dist | Out-Null
Copy-Item index.html,.nojekyll -Destination dist -Force
Copy-Item css,js,assets,frames -Destination dist -Recurse -Force

# 2. Đăng nhập Cloudflare (chỉ cần làm 1 lần)
npx wrangler login

# 3. Deploy
npx wrangler pages deploy dist --project-name=3d-tour-showroom --branch=main --commit-dirty=true
```

Muốn **tự động deploy mỗi lần push**: vào Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**, chọn repo `3d-tour-showroom`. Khi đó Cloudflare tự build từ nhánh `main` (không cần cấu hình build, để trống lệnh build và đặt *Build output directory* là `/`).

> File `.nojekyll` có sẵn để GitHub Pages không xử lý sai thư mục `assets/` (Cloudflare không cần file này nhưng vô hại).


---

## 7. Ghi chú kỹ thuật

- Không dùng thư viện ngoài. Toàn bộ chuyển động xoay, quán tính, zoom và pan đều viết bằng JS thuần + Canvas 2D.
- Ảnh frame được vẽ kiểu *cover* nên luôn kín khung hình ở mọi tỉ lệ màn hình.
- Frame được tải theo nhiều đợt (thưa trước, dày sau) nên có thể xoay ngay trong khi phần còn lại vẫn đang tải.
- Nút **VIEW 360 / VIEW 2D** được dựng bằng CSS theo đúng phong cách trong `assets/ui/viewbar.png` (viên thuốc trắng cho trạng thái đang chọn) để có thể hiển thị trạng thái active/inactive; file `viewbar.png` giữ lại làm tham chiếu thiết kế.
