"""
preview-hotspot.py — ve polygon hotspot len cac frame de kiem tra bang mat.

  python tools/preview-hotspot.py --id can-01 --step 10
Tao tools/preview-<id>.jpg (contact sheet). Them --video de xuat tools/preview-<id>.mp4.
"""
import argparse, json, os
import numpy as np
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ap = argparse.ArgumentParser()
ap.add_argument('--id', required=True)
ap.add_argument('--step', type=int, default=10)
ap.add_argument('--cols', type=int, default=5)
ap.add_argument('--width', type=int, default=960)
ap.add_argument('--video', action='store_true')
a = ap.parse_args()

with open(os.path.join(ROOT, 'js', 'hotspots.json'), encoding='utf-8') as f:
    hs = json.load(f)[a.id]['frames']


def render(i):
    im = cv2.imread(os.path.join(ROOT, 'frames', str(a.width), 'frame_%03d.webp' % i))
    h, w = im.shape[:2]
    d = hs['%03d' % i]
    if d['v']:
        p = (np.array(d['p'], np.float32).reshape(-1, 2) * [w, h]).astype(np.int32)
        ov = im.copy()
        cv2.fillPoly(ov, [p], (255, 160, 0))
        im = cv2.addWeighted(ov, .35, im, .65, 0)
        cv2.polylines(im, [p], True, (255, 220, 80), 2, cv2.LINE_AA)
    cv2.putText(im, str(i) + ('' if d['v'] else ' (an)'), (12, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    return im


if a.video:
    first = render(0)
    h, w = first.shape[:2]
    vw = cv2.VideoWriter(os.path.join(ROOT, 'tools', 'preview-%s.mp4' % a.id),
                         cv2.VideoWriter_fourcc(*'mp4v'), 24, (w, h))
    for i in range(len(hs)):
        vw.write(render(i))
    vw.release()
    print('Da ghi video')
else:
    idx = list(range(0, len(hs), a.step))
    tiles = [cv2.resize(render(i), (480, 270)) for i in idx]
    while len(tiles) % a.cols:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[r:r + a.cols]) for r in range(0, len(tiles), a.cols)]
    out = os.path.join(ROOT, 'tools', 'preview-%s.jpg' % a.id)
    cv2.imwrite(out, np.vstack(rows))
    print('Da ghi', out)
