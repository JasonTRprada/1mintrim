const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8765);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".onnx": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

http
  .createServer((req, res) => {
    let filePath = decodeURIComponent(req.url.split("?")[0]);
    if (filePath.endsWith("/")) filePath += "index.html";
    let full = path.join(root, filePath);
    // Cloudflare Pages 와 같은 clean URL: /gif → gif.html, /tools → tools/
    if (!fs.existsSync(full)) {
      if (fs.existsSync(full + ".html")) full += ".html";
      else if (fs.existsSync(path.join(full, "index.html"))) { res.writeHead(301, { Location: filePath + "/" }); return res.end(); }
    }
    fs.readFile(full, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Content-Type", mime[path.extname(full)] || "application/octet-stream");
      res.writeHead(200);
      res.end(data);
    });
  })
  .listen(port, () => console.log("listening on " + port));
