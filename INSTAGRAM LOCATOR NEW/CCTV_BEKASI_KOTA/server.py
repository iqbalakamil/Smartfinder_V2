import http.server
import socketserver
import urllib.request
import webbrowser
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path.startswith('/backupcctv/m3/'):
            target_url = 'https://eofficev2.bekasikota.go.id' + self.path
            req = urllib.request.Request(
                target_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://eofficev2.bekasikota.go.id/'
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
            super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(DIRECTORY)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("="*60)
        print(f"  CCTV Locator Kota Bekasi Web App is running!")
        print(f"  Akses Aplikasi di: http://localhost:{PORT}")
        print("="*60)
        print("Tekan Ctrl+C untuk menghentikan server.")
        try:
            webbrowser.open(f"http://localhost:{PORT}")
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer dihentikan.")
