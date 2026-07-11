const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 8765;

const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".wasm": "application/wasm",
};

http
  .createServer((req, res) => {
    let filePath = req.url.split("?")[0];
    if (filePath === "/") filePath = "/index.html";
    const full = path.join(root, filePath);
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
