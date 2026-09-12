import http.server
import socketserver
import urllib.request
import urllib.parse
import os

PORT = 8080

class CORSAndProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Proxy request ke dishub.depok.go.id untuk /vi/...
        if self.path.startswith('/vi/'):
            target_url = 'https://dishub.depok.go.id' + self.path
            req = urllib.request.Request(
                target_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://dishub.depok.go.id/cctv'
                }
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    content = response.read()
                    self.send_response(response.status)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
                    self.send_header('Access-Control-Allow-Headers', '*')
                    
                    if self.path.endswith('.m3u8'):
                        content_type = 'application/vnd.apple.mpegurl'
                    elif self.path.endswith('.ts'):
                        content_type = 'video/mp2t'
                    else:
                        content_type = response.headers.get('Content-Type') or 'application/octet-stream'
                            
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
            except Exception as e:
                print(f"[Proxy Error] {self.path} -> {e}")
                self.send_error(502, f"Proxy Error: {str(e)}")
        else:
            # Melayani file statis (index.html, cctv_data.json, dll)
            super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

if __name__ == '__main__':
    # Pastikan working directory di folder script berada
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CORSAndProxyHandler) as httpd:
        print(f"Server Dashboard & Proxy CCTV berjalan di http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer dihentikan.")
