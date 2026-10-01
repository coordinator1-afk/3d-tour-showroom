"""
track-hotspot.py — tu dong dat hotspot (polygon tren 1 mat phang tuong) len toan bo chuoi frame.

Y tuong: dung lai vi tri camera cua tung frame (SfM nhe bang OpenCV: SIFT + PnP), tim mat
phang tuong 3D tu cac diem dac trung nam quanh polygon mau, dat polygon len mat phang do,
roi chieu 3D -> 2D vao tung frame. Nhan dien frame nao tuong quay di (an hotspot) tu goc nhin.

Dung (vi du can-01):
  python tools/track-hotspot.py --id can-01 --ref 5 ^
      --points "483.7,422.1 486.6,462.1 528.5,473.1 528.3,433.1 541.3,423.3 502.2,409.1" ^
      --ref-size 1280x720

Ket qua ghi vao js/hotspots.json (them/ghi de muc theo --id), toa do chuan hoa 0..1.
"""
import argparse, json, os, sys
import numpy as np
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sift = cv2.SIFT_create(nfeatures=6000, contrastThreshold=0.02)
bf = cv2.BFMatcher(cv2.NORM_L2)


def load(i, width):
    p = os.path.join(ROOT, 'frames', str(width), 'frame_%03d.webp' % i)
    im = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    if im is None:
        sys.exit('Khong doc duoc ' + p)
    return im


class Frame:
    def __init__(self, idx, width):
        im = load(idx, width)
        self.idx = idx
        self.kp, self.des = sift.detectAndCompute(im, None)
        self.pts = np.float32([k.pt for k in self.kp])
        self.X = np.full((len(self.kp), 3), np.nan)     # diem 3D (he toa do the gioi)
        self.R = None
        self.t = None                                    # world -> camera


def match(a, b, ratio=0.75):
    m = bf.knnMatch(a.des, b.des, k=2)
    good = [x[0] for x in m if len(x) == 2 and x[0].distance < ratio * x[1].distance]
    qi = np.array([g.queryIdx for g in good], int)
    ti = np.array([g.trainIdx for g in good], int)
    return qi, ti


def proj_mat(K, R, t):
    return K @ np.hstack([R, t.reshape(3, 1)])


def triangulate(K, Ra, ta, Rb, tb, pa, pb):
    X = cv2.triangulatePoints(proj_mat(K, Ra, ta), proj_mat(K, Rb, tb), pa.T, pb.T)
    return (X[:3] / X[3]).T


def reproj_err(K, R, t, X, p):
    c = (R @ X.T + t.reshape(3, 1))
    z = c[2]
    uv = (K @ c)[:2] / z
    return np.linalg.norm(uv.T - p, axis=1), z


def parallax_ok(Ca, Cb, X, min_deg=0.4):
    va, vb = X - Ca, X - Cb
    cs = np.sum(va * vb, 1) / (np.linalg.norm(va, axis=1) * np.linalg.norm(vb, axis=1) + 1e-12)
    return np.degrees(np.arccos(np.clip(cs, -1, 1))) > min_deg


def center(R, t):
    return -R.T @ t


def add_points(K, a, b, qi, ti, mask=None):
    """Tam giac hoa cac cap khop a<->b (da biet pose), gan 3D cho b (va giu 3D cu cua a)."""
    if len(qi) == 0:
        return
    Xa = a.X[qi].copy()
    have = ~np.isnan(Xa[:, 0])
    new = ~have
    if new.any():
        pa, pb = a.pts[qi[new]], b.pts[ti[new]]
        X = triangulate(K, a.R, a.t, b.R, b.t, pa, pb)
        ea, za = reproj_err(K, a.R, a.t, X, pa)
        eb, zb = reproj_err(K, b.R, b.t, X, pb)
        ok = (za > 0) & (zb > 0) & (ea < 1.5) & (eb < 1.5) & parallax_ok(center(a.R, a.t), center(b.R, b.t), X)
        tmp = np.full_like(X, np.nan)
        tmp[ok] = X[ok]
        Xa[new] = tmp
        a.X[qi[new]] = tmp          # gan nguoc cho a de dung ve sau (vd. xet mat phang o frame mau)
    b.X[ti] = Xa


def init_pair(K, a, b):
    qi, ti = match(a, b)
    pa, pb = a.pts[qi], b.pts[ti]
    E, inl = cv2.findEssentialMat(pa, pb, K, cv2.RANSAC, 0.999, 1.0)
    if E is None:
        sys.exit('Khong khoi tao duoc cap anh dau (essential matrix)')
    _, R, t, mask = cv2.recoverPose(E, pa, pb, K, mask=inl)
    a.R, a.t = np.eye(3), np.zeros(3)
    b.R, b.t = R, t.reshape(3)
    ok = mask.ravel() > 0
    add_points(K, a, b, qi[ok], ti[ok])
    return int(ok.sum())


def pick_focal(a, b, w, h):
    """Chon tieu cu bang cach cuc dai so inlier cua essential matrix."""
    qi, ti = match(a, b)
    pa, pb = a.pts[qi], b.pts[ti]
    best, bf_ = -1, w
    for fov in range(30, 96, 5):                        # goc nhin ngang (do)
        f = (w / 2) / np.tan(np.radians(fov / 2))
        K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]], np.float64)
        E, inl = cv2.findEssentialMat(pa, pb, K, cv2.RANSAC, 0.999, 1.0)
        n = int(inl.sum()) if inl is not None else 0
        print('   fov %d: %d inlier' % (fov, n))
        if n > best:
            best, bf_ = n, f
    return bf_


def extend(K, prev, new):
    """Uoc luong pose cua frame `new` tu cac diem 3D cua `prev` (PnP), roi them diem moi."""
    qi, ti = match(prev, new)
    have = ~np.isnan(prev.X[qi][:, 0])
    if have.sum() < 12:
        return False
    obj = prev.X[qi][have].astype(np.float64)
    img = new.pts[ti][have].astype(np.float64)
    ok, rvec, tvec, inl = cv2.solvePnPRansac(obj, img, K, None, iterationsCount=300,
                                             reprojectionError=3.0, confidence=0.999,
                                             flags=cv2.SOLVEPNP_EPNP)
    if not ok or inl is None or len(inl) < 12:
        return False
    inl = inl.ravel()
    rvec, tvec = cv2.solvePnPRefineLM(obj[inl], img[inl], K, None, rvec, tvec)
    new.R, _ = cv2.Rodrigues(rvec)
    new.t = tvec.reshape(3)
    add_points(K, prev, new, qi, ti)
    print('  frame %03d: %d inlier PnP' % (new.idx, len(inl)))
    return True


def fit_plane(P, thr, iters=800):
    rng = np.random.default_rng(1)
    best, best_in = None, None
    for _ in range(iters):
        s = P[rng.choice(len(P), 3, replace=False)]
        n = np.cross(s[1] - s[0], s[2] - s[0])
        L = np.linalg.norm(n)
        if L < 1e-9:
            continue
        n /= L
        d = np.abs((P - s[0]) @ n)
        inl = d < thr
        if best is None or inl.sum() > best_in.sum():
            best, best_in = (n, s[0]), inl
    Q = P[best_in]
    c = Q.mean(0)
    n = np.linalg.svd(Q - c)[2][-1]                     # tinh lai bang bình phuong toi thieu
    return n, c, best_in


def fit_vertical_plane(P, up, thr, iters=1500):
    """Mat phang THANG DUNG (chua huong 'len'): chi con 2 bac tu do -> on dinh hon nhieu."""
    e1 = np.cross(up, [1, 0, 0] if abs(up[0]) < .9 else [0, 1, 0]); e1 /= np.linalg.norm(e1)
    e2 = np.cross(up, e1)
    Q = np.stack([P @ e1, P @ e2], 1)
    rng = np.random.default_rng(1)
    best = None
    for _ in range(iters):
        i, j = rng.choice(len(Q), 2, replace=False)
        d = Q[j] - Q[i]
        L = np.linalg.norm(d)
        if L < 1e-9:
            continue
        nrm = np.array([-d[1], d[0]]) / L
        inl = np.abs((Q - Q[i]) @ nrm) < thr
        if best is None or inl.sum() > best.sum():
            best = inl
    R_ = Q[best]
    c2 = R_.mean(0)
    nrm2 = np.linalg.svd(R_ - c2)[2][-1]
    n = e1 * nrm2[0] + e2 * nrm2[1]
    c = P[best].mean(0)
    return n / np.linalg.norm(n), c, best


def interp_pose(p0, p1, tau):
    R0, t0 = p0
    R1, t1 = p1
    C0, C1 = center(R0, t0), center(R1, t1)
    rv, _ = cv2.Rodrigues(R0.T @ R1)
    R, _ = cv2.Rodrigues(rv * tau)
    R = R0 @ R
    C = C0 * (1 - tau) + C1 * tau
    return R, -R @ C


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--ref', type=int, required=True, help='so frame mau')
    ap.add_argument('--points', required=True, help='"x,y x,y ..." theo toa do anh mau')
    ap.add_argument('--ref-size', default='1280x720', help='kich thuoc he toa do cua --points')
    ap.add_argument('--width', type=int, default=1280, help='bo frame dung de tracking')
    ap.add_argument('--count', type=int, default=250)
    ap.add_argument('--step', type=int, default=3, help='khoang cach frame khi dung camera')
    ap.add_argument('--grow', type=float, default=3.5, help='mo rong vung lay diem de fit mat phang')
    ap.add_argument('--min-cos', type=float, default=0.2, help='cos goc nhin toi thieu de hien')
    ap.add_argument('--fov', type=float, default=0, help='goc nhin ngang (do); 0 = tu do')
    ap.add_argument('--out', default=os.path.join(ROOT, 'js', 'hotspots.json'))
    a = ap.parse_args()

    rw, rh = [float(v) for v in a.ref_size.lower().split('x')]
    pts = np.array([[float(v) for v in p.split(',')] for p in a.points.split()], np.float32)
    ref_norm = pts / np.array([rw, rh], np.float32)

    N, s = a.count, a.step
    h, w = load(a.ref, a.width).shape
    poly0 = ref_norm * np.array([w, h], np.float32)

    print('Trich dac trung frame mau', a.ref)
    F0 = Frame(a.ref, a.width)
    if a.fov > 0:
        f = (w / 2) / np.tan(np.radians(a.fov / 2))
    else:
        print('Chon tieu cu...')
        f = pick_focal(F0, Frame((a.ref + 4 * s) % N, a.width), w, h)
    K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]], np.float64)
    print('Tieu cu f = %.1f (fov ngang %.1f do)' % (f, np.degrees(2 * np.arctan(w / 2 / f))))

    # ---- dung camera: di tien roi di lui tu frame mau
    F1 = Frame((a.ref + s) % N, a.width)
    print('Khoi tao cap frame', F0.idx, F1.idx, ':', init_pair(K, F0, F1), 'diem 3D')

    allf = [F0, F1]
    poses = {0: (F0.R, F0.t), s: (F1.R, F1.t)}          # khoa = do lech so voi frame mau
    prev = F1
    for off in range(2 * s, N // 2 + s, s):
        nf = Frame((a.ref + off) % N, a.width)
        if not extend(K, prev, nf):
            print('  dung o do lech', off)
            break
        poses[off] = (nf.R, nf.t)
        allf.append(nf)
        prev = nf
    prev = F0
    for off in range(-s, -(N // 2) - s, -s):
        nf = Frame((a.ref + off) % N, a.width)
        if not extend(K, prev, nf):
            print('  dung o do lech', off)
            break
        poses[off] = (nf.R, nf.t)
        allf.append(nf)
        prev = nf

    # ---- mat phang tuong quanh polygon (o frame mau)
    c = poly0.mean(0)
    big = (c + (poly0 - c) * a.grow).astype(np.int32)
    m = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m, [big], 255)
    sel = (~np.isnan(F0.X[:, 0])) & (m[np.clip(F0.pts[:, 1].astype(int), 0, h - 1),
                                      np.clip(F0.pts[:, 0].astype(int), 0, w - 1)] > 0)
    P = F0.X[sel]
    print('Diem 3D quanh polygon:', len(P))
    if len(P) < 8:
        sys.exit('Qua it diem 3D quanh polygon - thu tang --grow')
    depth = np.median(P[:, 2])
    n, c0, inl = fit_plane(P, thr=depth * 0.01)
    print('Mat phang: %d/%d inlier' % (inl.sum(), len(P)))
    if n @ (np.zeros(3) - c0) < 0:
        n = -n

    # ---- dat polygon len mat phang (tia tu camera mau, world = camera mau)
    rays = np.linalg.inv(K) @ np.vstack([poly0.T, np.ones(len(poly0))])
    den = n @ rays
    lam = (n @ c0) / den
    Q = (rays * lam).T                                  # 3D
    if (lam <= 0).any():
        print('CANH BAO: polygon cat mat phang sau camera')

    # ---- chieu vao tung frame
    keys = sorted(poses)
    frames, nvis = {}, 0
    for i in range(N):
        off = ((i - a.ref + N // 2) % N) - N // 2
        lo = max([k for k in keys if k <= off], default=None)
        hi = min([k for k in keys if k >= off], default=None)
        v, pp = 0, poly0 / [w, h]
        if lo is not None and hi is not None:
            R, t = interp_pose(poses[lo], poses[hi], 0 if hi == lo else (off - lo) / (hi - lo))
            Cc = center(R, t)
            cam = (R @ Q.T + t.reshape(3, 1))
            if (cam[2] > 0).all():
                uv = ((K @ cam)[:2] / cam[2]).T
                pp = uv / [w, h]
                cs = float(n @ (Cc - c0) / np.linalg.norm(Cc - c0))
                inside = ((uv[:, 0] > -0.05 * w) & (uv[:, 0] < 1.05 * w) &
                          (uv[:, 1] > -0.05 * h) & (uv[:, 1] < 1.05 * h)).all()
                v = int(cs > a.min_cos and inside)
        nvis += v
        frames['%03d' % i] = {'v': v, 'p': [round(float(x), 5) for x in np.asarray(pp).reshape(-1)]}
    print('Frame hien:', nvis, '/', N)

    data = {}
    if os.path.exists(a.out):
        with open(a.out, encoding='utf-8') as f_:
            data = json.load(f_)
    data[a.id] = {'ref': a.ref, 'frames': frames}
    with open(a.out, 'w', encoding='utf-8') as f_:
        json.dump(data, f_, separators=(',', ':'))
    print('Da ghi', a.out)


if __name__ == '__main__':
    main()
