const { handleRequest } = require("../server");

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith("/api/")) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Endpoint tidak ditemukan." }));
    return;
  }

  return handleRequest(req, res);
};
