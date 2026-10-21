"use strict";

const $ = id => document.getElementById(id);

let payments = [];
let siteCount = 0;

try {
  const saved = localStorage.getItem("recuperador_payments");
  payments = saved ? JSON.parse(saved) : [];
  if (!Array.isArray(payments)) payments = [];
} catch {
  payments = [];
}

function showPage(id) {
  const page = $(id);
  if (!page) return;

  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("hidden", section !== page);
  });

  document.querySelectorAll(".navbtn").forEach(button => {
    button.classList.toggle("active", button.dataset.page === id);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".navbtn").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

document.querySelectorAll("[data-goto]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.goto));
});

$("openAnalyzer").addEventListener("click", () => {
  $("siteUrl").value = $("quickUrl").value.trim();
  showPage("sites");
});

function money(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function savePayments() {
  try {
    localStorage.setItem("recuperador_payments", JSON.stringify(payments));
  } catch {
    alert("Não foi possível salvar os dados neste navegador.");
  }
}

function renderPayments() {
  const tbody = $("paymentRows");
  tbody.replaceChildren();

  if (!payments.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Nenhum registro encontrado.";
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  payments.forEach(payment => {
    const row = document.createElement("tr");

    [
      payment.description,
      payment.date,
      payment.status,
      money(payment.amount)
    ].forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  const approved = payments.filter(p => p.status === "Aprovado");
  const pending = payments.filter(p => p.status === "Pendente");

  const sum = list => list.reduce((total, p) => total + p.amount, 0);

  $("approvedTotal").textContent = money(sum(approved));
  $("pendingTotal").textContent = money(sum(pending));
  $("approvedCount").textContent = approved.length;
  $("pendingCount").textContent = pending.length;
  $("paymentCount").textContent = payments.length;
}

$("paymentForm").addEventListener("submit", event => {
  event.preventDefault();

  const description = $("description").value.trim();
  const amount = Number($("amount").value);
  const status = $("paymentStatus").value;

  if (
    !description ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !["Aprovado", "Pendente", "Recusado"].includes(status)
  ) {
    alert("Confira a descrição, o valor e o status.");
    return;
  }

  payments.push({
    description,
    amount,
    status,
    date: new Date().toLocaleDateString("pt-BR")
  });

  savePayments();
  renderPayments();
  event.target.reset();
});

$("clearPayments").addEventListener("click", () => {
  if (!confirm("Deseja apagar todos os registros locais?")) return;

  payments = [];
  savePayments();
  renderPayments();
});

function printReport(title, elementId) {
  const element = $(elementId);
  if (!element) return;

  const win = window.open("", "_blank");

  if (!win) {
    alert("Permita a abertura de uma janela para gerar o relatório.");
    return;
  }

  const style = win.document.createElement("style");
  style.textContent = `
    body { font: 14px Arial, sans-serif; margin: 28px; color: #111; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #aaa; padding: 8px; text-align: left; }
    button, form { display: none !important; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  `;

  win.document.head.appendChild(style);
  win.document.title = title;

  const heading = win.document.createElement("h1");
  heading.textContent = title;
  win.document.body.appendChild(heading);

  const date = win.document.createElement("p");
  date.textContent = "Gerado em " + new Date().toLocaleString("pt-BR");
  win.document.body.appendChild(date);

  win.document.body.appendChild(element.cloneNode(true));
  win.focus();
  win.print();
}

$("paymentPrint").addEventListener("click", () => {
  printReport("Relatório de pagamentos", "paymentReport");
});

$("reportPaymentPrint").addEventListener("click", () => {
  printReport("Relatório de pagamentos", "paymentReport");
});

$("generalPrint").addEventListener("click", () => {
  printReport("Resumo do Recuperador de Sites", "inicio");
});

$("sitePrint").addEventListener("click", () => {
  printReport("Relatório de análise de site", "siteResults");
});

$("siteForm").addEventListener("submit", async event => {
  event.preventDefault();

  const status = $("siteStatus");
  const results = $("siteResults");
  const button = $("analyzeBtn");

  results.replaceChildren();
  $("sitePrint").classList.add("hidden");

  let url;

  try {
    url = new URL($("siteUrl").value.trim());

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error("Informe uma URL HTTP ou HTTPS válida.");
    }
  } catch {
    status.textContent = "Informe uma URL válida.";
    return;
  }

  button.disabled = true;
  status.textContent = "Consultando o backend...";

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.href })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status}`);
    }

    const doc = new DOMParser().parseFromString(
      data.html,
      "text/html"
    );

    const heading = document.createElement("h3");
    heading.textContent = doc.title || url.hostname;

    const paragraph = document.createElement("p");
    paragraph.textContent = "Endereço analisado: " + data.url;

    const content = document.createElement("pre");
    content.textContent = (
      doc.body?.innerText ||
      doc.body?.textContent ||
      ""
    ).slice(0, 20000);

    const linksHeading = document.createElement("h3");
    linksHeading.textContent = "Links encontrados";

    const list = document.createElement("ul");
    const uniqueLinks = new Set();

    doc.querySelectorAll("a[href]").forEach(anchor => {
      try {
        const found = new URL(anchor.getAttribute("href"), data.url);

        if (["http:", "https:"].includes(found.protocol)) {
          uniqueLinks.add(found.href);
        }
      } catch {
        // Ignora links inválidos.
      }
    });

    [...uniqueLinks].slice(0, 100).forEach(href => {
      const item = document.createElement("li");
      const link = document.createElement("a");

      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = href;

      item.appendChild(link);
      list.appendChild(item);
    });

    results.append(heading, paragraph, content, linksHeading, list);

    status.textContent = "Análise concluída.";
    $("sitePrint").classList.remove("hidden");

    siteCount++;
    $("siteCount").textContent = siteCount;
  } catch (error) {
    status.textContent =
      "Não foi possível concluir a análise.\n" + error.message;
  } finally {
    button.disabled = false;
  }
});
  event.preventDefault();

  const status = $("siteStatus");
  const results = $("siteResults");
  const button = $("analyzeBtn");

  results.replaceChildren();
  $("sitePrint").classList.add("hidden");

  let url;

  try {
    url = new URL($("siteUrl").value.trim());

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error("URL inválida ou não permitida.");
    }
  } catch {
    status.textContent = "Informe uma URL HTTP ou HTTPS válida.";
    return;
  }

  button.disabled = true;
  status.textContent = "Tentando acessar o conteúdo público...";

  try {
    const response = await fetch(url.href, {
      mode: "cors",
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      throw new Error("O servidor respondeu com HTTP " + response.status);
    }

    const contentType = response.headers.get("content-type") || "";

    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      throw new Error("O endereço não retornou HTML ou texto.");
    }

    const raw = (await response.text()).slice(0, 400000);
    const doc = new DOMParser().parseFromString(raw, "text/html");

    const heading = document.createElement("h3");
    heading.textContent = doc.title || url.hostname;

    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = url.href;

    const paragraph = document.createElement("p");
    paragraph.appendChild(link);

    const content = document.createElement("pre");
    content.textContent = (
      doc.body?.innerText ||
      doc.body?.textContent ||
      ""
    ).slice(0, 20000);

    const linkHeading = document.createElement("h3");
    linkHeading.textContent = "Links encontrados";

    const list = document.createElement("ul");

    [...doc.querySelectorAll("a[href]")]
      .slice(0, 100)
      .forEach(anchor => {
        try {
          const found = new URL(anchor.getAttribute("href"), url.href);

          if (!["http:", "https:"].includes(found.protocol)) return;

          const item = document.createElement("li");
          const foundLink = document.createElement("a");

          foundLink.href = found.href;
          foundLink.target = "_blank";
          foundLink.rel = "noopener noreferrer";
          foundLink.textContent = found.href;

          item.appendChild(foundLink);
          list.appendChild(item);
        } catch {
          // Ignora links inválidos.
        }
      });

    results.append(heading, paragraph, content, linkHeading, list);

    status.textContent = "Conteúdo público acessado com sucesso.";
    $("sitePrint").classList.remove("hidden");

    siteCount++;
    $("siteCount").textContent = siteCount;
  } catch (error) {
    status.textContent =
      "Não foi possível ler esta página pelo navegador.\n" +
      "O site pode bloquear CORS ou impedir o acesso.\n" +
      "Detalhe: " + error.message;
  } finally {
    button.disabled = false;
  }
});

$("chatForm").addEventListener("submit", event => {
  event.preventDefault();

  const input = $("chatMessage");
  const message = input.value.trim();

  if (!message) return;

  const userMessage = document.createElement("p");
  userMessage.textContent = "Você: " + message;
  $("chatHistory").appendChild(userMessage);

  const reply = document.createElement("p");
  reply.textContent =
    "NEURA AI: ainda preciso de uma integração com um modelo de IA " +
    "para responder de forma inteligente.";

  $("chatHistory").appendChild(reply);
  input.value = "";
});

renderPayments();
