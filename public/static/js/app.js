const chatArea = document.getElementById("chatArea");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const toggleSidebar = document.getElementById("toggleSidebar");
const sidebar = document.getElementById("sidebar");
const newChatBtn = document.getElementById("newChatBtn");

let eventSource = null;
let conversationId = localStorage.getItem("conversation_id") || "";
let assistantBubble = null;
let fullText = "";
let streaming = false;

/* ---------- helpers ---------- */

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])
  );
}

function addMessage(role, html = "") {
  const msg = document.createElement("div");
  msg.className = "message " + role;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = html;

  msg.appendChild(bubble);
  chatArea.appendChild(msg);
  chatArea.scrollTop = chatArea.scrollHeight;
  return bubble;
}

/* ---------- render markdown + code ---------- */

function renderMessage(text) {
  const parts = text.split(/```/);
  let html = "";

  parts.forEach((p, i) => {
    if (i % 2 === 0) {
      if (p.trim()) html += `<div>${escapeHtml(p)}</div>`;
    } else {
      const lines = p.split("\n");
      const lang = lines.shift() || "code";
      const code = lines.join("\n");

      html += `
        <div class="code-block">
          <div class="code-header">
            <span>${lang}</span>
            <button onclick="copyCode(this)">Copy</button>
          </div>
          <pre>${escapeHtml(code)}</pre>
        </div>`;
    }
  });

  return html;
}

window.copyCode = btn => {
  navigator.clipboard.writeText(
    btn.parentElement.nextElementSibling.innerText
  );
  btn.innerText = "✓";
  setTimeout(() => (btn.innerText = "Copy"), 1000);
};

/* ---------- incomplete detect ---------- */

function isIncomplete(text) {
  const fences = (text.match(/```/g) || []).length;
  if (fences % 2 !== 0) return true;

  const last = text.trim().split("\n").pop();
  return last && !/[.!?]$/.test(last);
}

/* ---------- Continue ---------- */

function showContinue() {
  removeContinue();

  const box = document.createElement("div");
  box.className = "continue-box";

  const btn = document.createElement("button");
  btn.innerText = "↻ Continue";
  btn.onclick = () => {
    removeContinue();
    startStream(true);
  };

  box.appendChild(btn);
  assistantBubble.appendChild(box);
}

function removeContinue() {
  const old = assistantBubble?.querySelector(".continue-box");
  if (old) old.remove();
}

/* ---------- Streaming ---------- */

function startStream(isContinue = false) {
  if (streaming) return;
  streaming = true;
  stopBtn.disabled = false;

  if (!isContinue) {
    addMessage("user", escapeHtml(userInput.value));
    assistantBubble = addMessage("assistant", "");
    fullText = "";
  }

  const message = isContinue
    ? "continue from where you stopped, do not repeat"
    : userInput.value;

  userInput.value = "";

  eventSource = new EventSource(
    `/api/chat/stream?message=${encodeURIComponent(message)}&conversation_id=${conversationId}`
  );

  eventSource.onmessage = e => {
    if (e.data === "[DONE]") {
      eventSource.close();
      eventSource = null;
      streaming = false;
      stopBtn.disabled = true;

      assistantBubble.innerHTML = renderMessage(fullText);
      if (isIncomplete(fullText)) showContinue();
      return;
    }

    const data = JSON.parse(e.data);

    if (data.conversation_id) {
      conversationId = data.conversation_id;
      localStorage.setItem("conversation_id", conversationId);
      return;
    }

    if (data.content) {
      fullText += data.content;
      assistantBubble.textContent = fullText;
    }
  };
}

/* ---------- UI controls ---------- */

sendBtn.onclick = () => {
  if (!userInput.value.trim()) return;
  startStream(false);
};

stopBtn.onclick = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    streaming = false;
    stopBtn.disabled = true;
    if (isIncomplete(fullText)) showContinue();
  }
};

/* Sidebar toggle */
let sidebarState = 0;
toggleSidebar.onclick = () => {
  sidebarState = (sidebarState + 1) % 3;
  sidebar.classList.remove("hidden", "compact");
  if (sidebarState === 0) sidebar.classList.add("hidden");
  if (sidebarState === 1) sidebar.classList.add("compact");
};

newChatBtn.onclick = () => {
  conversationId = "";
  localStorage.removeItem("conversation_id");
  chatArea.innerHTML = "";
};