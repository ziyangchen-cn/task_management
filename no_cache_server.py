#!/usr/bin/env python3
"""Local dev server for Research OS that disables browser caching entirely.

Plain `python3 -m http.server` relies on Last-Modified/ETag conditional
requests, which browsers can skip based on their own heuristics -- in
practice this meant edits sometimes didn't show up after a normal refresh,
only after a hard refresh (Cmd+Shift+R). This server just tells the browser
never to cache anything, so a normal refresh always gets the latest files.
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    HTTPServer(('', PORT), NoCacheHandler).serve_forever()
