"use strict";

const express = require("express");
const dns = require("node:dns").promises;
const net = require("node:net");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "Recuperador de Sites" });
});

function isPublicIP(ip) {
  const family = net.isIP(ip);

  if (family === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;

    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }

  if (family === 6) {
    const normalized = ip.toLowerCase();

    if (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff")
    ) {
      return false;
    }

    // IPv4-mapped IPv6: também validar o endereço IPv4.
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice(7);
      return net.isIP(mapped) === 4 && isPublicIP(mapped);
    }

    return true;
  }

  return false;
}

async function validatePublicUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Informe uma URL válida.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Use uma URL HTTP ou HTTPS pública.");
  }

  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Porta não permitida.");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Endereço local não permitido.");
  }

  if (net.isIP(hostname)) {
    if (!isPublicIP(hostname)) {
      throw new Error("Endereço IP privado não permitido.");
    }
  } else {
    let records;

    try {
      records = await dns.lookup(hostname, { all: true });
    } catch {
      throw new Error("Não foi possível resolver o domínio.");
    }

    if (!records.length || records.some(r => !isPublicIP(r.address))) {
      throw new Error("O domínio não passou na validação de segurança.");
    }
  }

  return url;
}

app.post("/api/analyze", async (req, res) => {
  try {
    const url = await validatePublicUrl(req.body?.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;

    try {
      // Não seguir redirecionamentos automaticamente:
      // cada novo destino precisa passar por validação.
      response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "RecuperadorDeSites/1.0",
          "Accept": "text/html,text/plain;q=0.9"
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      return res.status(400).json({
        error: "O site redirecionou a solicitação. O destino precisa ser validado separadamente."
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: `O site recusou a solicitação: HTTP ${response.status}.`,
        code: response.status
      });
    }

    const type = response.headers.get("content-type") || "";

    if (
      !type.includes("text/html") &&
      !type.includes("text/plain")
    ) {
      return res.status(415).json({
        error: "O endereço não retornou HTML ou texto."
      });
    }

    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        size += value.byteLength;

        if (size > 400000) {
          await reader.cancel();
          return res.status(413).json({
            error: "A página excede o limite de leitura de 400 KB."
          });
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
    const html = new TextDecoder().decode(bytes);

    res.json({
      url: url.href,
      contentType: type,
      html
    });
  } catch (error) {
    const message = error.name === "AbortError"
      ? "O site demorou demais para responder."
      : error.message || "Falha ao consultar o site.";

    res.status(400).json({ error: message });
  }
});


app.get("/", (_req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/style.css", (_req, res) => {
  res.sendFile(__dirname + "/style.css");
});

app.get("/script.js", (_req, res) => {
  res.sendFile(__dirname + "/script.js");
});
 app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});
