"use strict";

const $ = id => document.getElementById(id);

let payments = [];
let siteCount = 0;

try {
  const saved = JSON.parse(
    localStorage.getItem("recuperador_payments") || "[]"
  );
  if (Array.isArray(saved)) payments = saved;
} catch {
  payments = [];
}

function showPage(id) {
  const page = $(id);
  if (!page) return;

  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("hidden", section.id !== id);
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

const openAnalyzer = $("openAnalyzer");
if (openAnalyzer) {
  openAnalyzer.addEventListener("click", () => {
    const quickUrl = $("quickUrl");
    const siteUrl = $("siteUrl");

    if (quickUrl && siteUrl) siteUrl.value = quickUrl.value.trim();
    showPage("sites");
  });
}

function money(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function savePayments() {
  try {
    localStorage.setItem(
      "recuperador_payments",
      JSON.stringify(payments)
    );
  } catch {
    alert("Não foi possível salvar os registros neste navegador.");
  }
}

function renderPayments() {
  const tbody = $("paymentRows");
  if (!tbody) return;

  tbody.replaceChildren();

  if (payments.length === 0) {
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
      cell.textContent = String(value);
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  });

  const approved = payments.filter(p => p.status === "Aprovado");
  const pending = payments.filter(p => p.status === "Pendente");
  const sum = list => list.reduce((total, p) => total + Number(p.amount), 0);

  if ($("approvedTotal")) $("approvedTotal").textContent = money(sum(approved));
  if ($("pendingTotal")) $("pendingTotal").textContent = money(sum(pending));
  if ($("approvedCount")) $("approvedCount").textContent = approved.length;
  if ($("pendingCount")) $("pendingCount").textContent = pending.length;
  if ($("paymentCount")) $("paymentCount").textContent = payments.length;
}

const paymentForm = $("paymentForm");
if (paymentForm) {
  paymentForm.addEventListener("submit", event => {
    event.preventDefault();

    const description = $("description").value.trim();
    const amount = Number($("amount").value);
    const status = $("paymentStatus").value;

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      alert("Informe uma descrição e um valor válido.");
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
    paymentForm.reset();
  });
}

const clearButton = $("clearPayments");
if (clearButton) {
  clearButton.addEventListener("click", () => {
    if (!confirm("Apagar todos os registros locais?")) return;
    payments = [];
    savePayments();
    renderPayments();
  });
}

function printReport(title, elementId) {
  const element = $(elementId);
  if (!element) {
    alert("A área do relatório não foi encontrada.");
    return;
  }

  const win = window.open("", "_blank");
  if (!win) {
    alert("Permita abrir uma janela para imprimir o relatório.");
    return;
  }

  const heading = win.document.createElement("h1");
  heading.textContent = title;

  const date = win.document.createElement("p");
  date.textContent = "Gerado em " + new Date().toLocaleString("pt-BR");

  const style = win.document.createElement("style");
  style.textContent =
    "body{font:14px Arial;margin:25px;color:#111}" +
    "table{border-collapse:collapse;width:100%}" +
    "td,th{border:1px solid #aaa;padding:8px;text-align:left}" +
    "button,form{display:none!important}pre{white-space:pre-wrap}";

  win.document.head.appendChild(style);
  win.document.title = title;
  win.document.body.append(heading, date, element.cloneNode(true));
  win.focus();
  win.print();
}

const paymentPrint = $("paymentPrint");
if (paymentPrint) {
  paymentPrint.addEventListener("click", () =>
    printReport("Relatório de pagamentos", "paymentReport")
  );
}

const reportPaymentPrint = $("reportPaymentPrint");
if (reportPaymentPrint) {
  reportPaymentPrint.addEventListener("click", () =>
    printReport("Relatório de pagamentos", "paymentReport")
  );
}

const generalPrint = $("generalPrint");
if (generalPrint) {
  generalPrint.addEventListener("click", () =>
    printReport("Resumo do Recuperador de Sites", "dashboard")
  );
}

const sitePrint = $("sitePrint");
if (sitePrint) {
  sitePrint.addEventListener("click", () =>
    printReport("Relatório de análise de site", "siteResults")
  );
}

// Análise através do backend no mesmo serviço Render.
const siteForm = $("siteForm");

if (siteForm) {
  siteForm.addEventListener("submit", async event => {
    event.preventDefault();

    const status = $("siteStatus");
    const results = $("siteResults");
    const button = $("analyzeBtn");

    results.replaceChildren();
    sitePrint?.classList.add("hidden");

    let url;

    try {
      url = new URL($("siteUrl").value.trim());

      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error("Use um endereço HTTP ou HTTPS válido.");
      }
    } catch {
      status.textContent = "Informe uma URL válida, começando por https:// ou http://.";
      return;
    }

    button.disabled = true;
    status.textContent = "Enviando endereço ao backend do Render...";

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.href })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || `O backend respondeu com HTTP ${response.status}.`
        );
      }

      if (typeof data.html !== "string") {
        throw new Error("O backend respondeu, mas não enviou o conteúdo HTML esperado.");
      }

      const doc = new DOMParser().parseFromString(data.html, "text/html");

      const heading = document.createElement("h3");
      heading.textContent = doc.title || url.hostname;

      const address = document.createElement("p");
      address.textContent = "Endereço analisado: " + (data.url || url.href);

      const content = document.createElement("pre");
      content.textContent = (
        doc.body?.innerText ||
        doc.body?.textContent ||
        "Nenhum texto encontrado na página."
      ).slice(0, 20000);

      const linksHeading = document.createElement("h3");
      linksHeading.textContent = "Links encontrados";

      const list = document.createElement("ul");
      const links = new Set();

      doc.querySelectorAll("a[href]").forEach(anchor => {
        try {
          const link = new URL(anchor.getAttribute("href"), data.url || url.href);
          if (["http:", "https:"].includes(link.protocol)) {
            links.add(link.href);
          }
        } catch {
          // Ignora links inválidos.
        }
      });

      [...links].slice(0, 100).forEach(href => {
        const item = document.createElement("li");
        const link = document.createElement("a");

        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = href;

        item.appendChild(link);
        list.appendChild(item);
      });

      results.append(heading, address, content, linksHeading, list);
      status.textContent = "Análise concluída. Links encontrados: " + links.size + ".";

      sitePrint?.classList.remove("hidden");

      siteCount++;
      if ($("siteCount")) $("siteCount").textContent = siteCount;
    } catch (error) {
      status.textContent =
        "Falha na análise.\n" +
        (error.message || "Não foi possível conectar ao backend.");
    } finally {
      button.disabled = false;
    }
  });
}

const chatForm = $("chatForm");
if (chatForm) {
  chatForm.addEventListener("submit", event => {
    event.preventDefault();

    const input = $("chatMessage");
    const history = $("chatHistory");
    const message = input.value.trim();

    if (!message) return;

    const userMessage = document.createElement("p");
    userMessage.textContent = "Você: " + message;

    const reply = document.createElement("p");
    reply.textContent =
      "NEURA AI: esta é uma demonstração. Conecte um provedor de IA por um backend seguro para receber respostas reais.";

    history.append(userMessage, reply);
    input.value = "";
  });
}

renderPayments();

// Confirma que o JavaScript carregou e que a API está acessível.
fetch("/api/health")
  .then(response => {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  })
  .then(data => {
    console.log("Backend conectado:", data.status);
  })
  .catch(error => {
    console.error("Falha na conexão com o backend:", error);
  });
