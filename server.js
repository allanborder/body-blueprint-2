const http  = require("http");
const https = require("https");

const GROQ_API_KEY = "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";
const PORT         = 3001;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

http.createServer((req, res) => {
  cors(res);

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "POST" && req.url === "/api/chat") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {

      let parsed;
      try { parsed = JSON.parse(body); }
      catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Invalid JSON" } }));
        return;
      }

      const payload = JSON.stringify({
        model:      "llama-3.3-70b-versatile",
        max_tokens: parsed.max_tokens || 4000,
        messages:   parsed.messages,
      });

      const options = {
        hostname: "api.groq.com",
        path:     "/openai/v1/chat/completions",
        method:   "POST",
        headers: {
          "Content-Type":   "application/json",
          "Authorization":  `Bearer ${GROQ_API_KEY}`,
          "Content-Length": Buffer.byteLength(payload),
        },
      };

      const proxyReq = https.request(options, proxyRes => {
        let data = "";
        proxyRes.on("data", c => { data += c; });
        proxyRes.on("end", () => {
          try {
            const groqRes = JSON.parse(data);

            if (groqRes.error) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: { message: groqRes.error.message } }));
              return;
            }

            // Convert Groq (OpenAI-style) → Anthropic-style so App.jsx needs zero changes
            const text = groqRes.choices?.[0]?.message?.content || "";
            const anthropicStyle = {
              content: [{ type: "text", text }]
            };

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(anthropicStyle));
          } catch (e) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { message: "Parse error: " + e.message } }));
          }
        });
      });

      proxyReq.on("error", e => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Proxy error: " + e.message } }));
      });

      proxyReq.write(payload);
      proxyReq.end();
    });

  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "POST /api/chat only" } }));
  }

}).listen(PORT, () => {
  console.log(`\n✅  Groq proxy running on http://localhost:${PORT}/api/chat\n`);
});