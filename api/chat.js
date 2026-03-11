const https = require("https");

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")    { res.status(404).json({ error: { message: "POST only" } }); return; }

  const { messages, max_tokens } = req.body;

  if (!messages) { res.status(400).json({ error: { message: "Missing messages" } }); return; }

  const payload = JSON.stringify({
    model:      "llama-3.3-70b-versatile",
    max_tokens: max_tokens || 4000,
    messages,
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
          res.status(400).json({ error: { message: groqRes.error.message } });
          return;
        }
        // Convert Groq → Anthropic-style so App.jsx needs zero changes
        const text = groqRes.choices?.[0]?.message?.content || "";
        res.status(200).json({ content: [{ type: "text", text }] });
      } catch (e) {
        res.status(502).json({ error: { message: "Parse error: " + e.message } });
      }
    });
  });

  proxyReq.on("error", e => {
    res.status(502).json({ error: { message: "Proxy error: " + e.message } });
  });

  proxyReq.write(payload);
  proxyReq.end();
}