const chatArea = document.getElementById("chatArea");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const toggleSidebar = document.getElementById("toggleSidebar");
const sidebar = document.getElementById("sidebar");
const newChatBtn = document.getElementById("newChatBtn");

let eventSource = null;
let conversationId = localStorage.getItem("conversation_id") || "";
let activeAssistantBubble = null;
let fullText = "";

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

/* ---------- code parsing ---------- */

function renderParsed(text) {
  const parts = text.split(/```/);
  let out = "";

  parts.forEach((p, i) => {
    if (i % 2 === 0) {
      out += `<div>${escapeHtml(p)}</div>`;
    } else {
      const lines = p.split("\n");
      const lang = lines.shift() || "code";
      const code = lines.join("\n");
      out += `
        <div class="code-block">
          <div class="code-header">
            <span>${lang}</span>
            <button onclick="copyCode(this)">Copy</button>
          </div>
          <pre>${escapeHtml(code)}</pre>
        </div>`;
    }
  });
  return out;
}

window.copyCode = btn => {
  const code = btn.parentElement.nextElementSibling.innerText;
  navigator.clipboard.writeText(code);
  btn.innerText = "✓";
  setTimeout(() => btn.innerText = "Copy", 1000);
};

/* ---------- streaming ---------- */

function startStream(message, isContinue = false) {
  stopBtn.disabled = false;

  if (!isContinue) {
    addMessage("user", escapeHtml(message));
    activeAssistantBubble = addMessage("assistant", "");
    fullText = "";
  }

  eventSource = new EventSource(
    `/api/chat/stream?message=${encodeURIComponent(message)}&conversation_id=${conversationId}`
  );

  eventSource.onmessage = e => {
    if (e.data === "[DONE]") {
      eventSource.close();
      eventSource = null;
      stopBtn.disabled = true;

      activeAssistantBubble.innerHTML = renderParsed(fullText);

      if (needsContinue(fullText)) {
        const btn = document.createElement("button");
        btn.className = "continue-btn";
        btn.innerText = "↻ Continue";
        btn.onclick = () => {
          btn.remove();
          startStream("continue from where you stopped", true);
        };
        activeAssistantBubble.appendChild(btn);
      }
      return;
    }

    const data = JSON.parse(e.data);
    if (data.conversation_id) {
      conversationId = data.conversation_id;
      localStorage.setItem("conversation_id", conversationId);
    }
    if (data.content) {
      fullText += data.content;
      activeAssistantBubble.textContent = fullText;
    }
  };
}

/* ---------- detect incomplete ---------- */

function needsContinue(text) {
  const fences = (text.match(/```/g) || []).length;
  return fences % 2 !== 0 || text.trim().length < 20;
}

/* ---------- controls ---------- */

sendBtn.onclick = () => {
  if (eventSource) return;
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = "";
  startStream(text);
};

stopBtn.onclick = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    stopBtn.disabled = true;
  }
};

toggleSidebar.onclick = () => {
  sidebar.classList.toggle("hidden");
};

newChatBtn.onclick = () => {
  conversationId = "";
  localStorage.removeItem("conversation_id");
  chatArea.innerHTML = "";
};