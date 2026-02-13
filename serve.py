#!/usr/bin/env python3
"""Simple HTTP server with Range request support for video files."""

import http.server
import os
import re

class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path):
            self.send_error(404, "File not found")
            return None

        if os.path.isdir(path):
            return super().send_head()

        # Handle range requests for video files
        file_size = os.path.getsize(path)
        range_header = self.headers.get('Range')

        if range_header:
            # Parse range header
            match = re.match(r'bytes=(\d+)-(\d*)', range_header)
            if match:
                start = int(match.group(1))
                end = int(match.group(2)) if match.group(2) else file_size - 1

                if start >= file_size:
                    self.send_error(416, "Requested Range Not Satisfiable")
                    return None

                end = min(end, file_size - 1)
                length = end - start + 1

                self.send_response(206)
                self.send_header("Content-Type", self.guess_type(path))
                self.send_header("Content-Length", str(length))
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()

                f = open(path, 'rb')
                f.seek(start)
                return _RangeFile(f, length)

        # No range request, serve normally but add Accept-Ranges header
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Length", str(file_size))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        return open(path, 'rb')

class _RangeFile:
    """Wrapper to read only a portion of a file."""
    def __init__(self, f, length):
        self.f = f
        self.remaining = length

    def read(self, size=-1):
        if self.remaining <= 0:
            return b''
        if size < 0 or size > self.remaining:
            size = self.remaining
        data = self.f.read(size)
        self.remaining -= len(data)
        return data

    def close(self):
        self.f.close()

if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving on http://localhost:{port}")
    http.server.HTTPServer(("", port), RangeHTTPRequestHandler).serve_forever()
