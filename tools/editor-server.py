"""
editor-server.py — may chu nho: phuc vu du an + nhan nut "Luu" tu tools/hotspot-editor.html.

  python tools/editor-server.py            (mo http://localhost:8123/tools/hotspot-editor.html)

Khong cache file, nen sua xong chi can tai lai trang.
"""
import json, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        route = self.path.split('?')[0]
        if route not in ('/save-hotspot', '/save-cameras'):
            self.send_error(404)
            return
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if route == '/save-cameras':
            with open(os.path.join(ROOT, 'js', 'cameras.json'), 'w', encoding='utf-8') as f:
                json.dump(body, f, ensure_ascii=False, separators=(',', ':'))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ok')
            return
        path = os.path.join(ROOT, 'js', 'hotspots.json')
        if 'all' in body:
            data = body['all']                       # ghi de toan bo (them/xoa/doi ten/doi link)
        else:
            data = {}
            if os.path.exists(path):
                with open(path, encoding='utf-8') as f:
                    data = json.load(f)
            data[body['id']] = body['data']
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, separators=(',', ':'))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')


print('Mo http://localhost:%d/tools/hotspot-editor.html' % PORT)
ThreadingHTTPServer(('', PORT), H).serve_forever()
