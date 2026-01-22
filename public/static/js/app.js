const chatArea = document.getElementById("chatArea");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const toggleSidebar = document.getElementById("toggleSidebar");
const sidebar = document.getElementById("sidebar");
const newChatBtn = document.getElementById("newChatBtn");

let eventSource = null;
let conversationId = localStorage.getItem("conversation_id") || "";
let sidebarState = 0;

/* ---------------- helpers ---------------- */

function addMessage(role, html) {
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

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])
  );
}

/* ---------------- code parser ---------------- */

function parseMessage(text) {
  const parts = text.split(/```/);
  let out = "";

  parts.forEach((p, i) => {
    if (i % 2 === 0) {
      if (p.trim()) out += `<div>${escapeHtml(p)}</div>`;
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
          <pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>
        </div>`;
    }
  });

  return out;
}

window.copyCode = (btn) => {
  navigator.clipboard.writeText(
    btn.parentElement.nextElementSibling.innerText
  );
  btn.innerText = "✓";
  setTimeout(() => (btn.innerText = "Copy"), 1000);
};

/* ---------------- incomplete detect ---------------- */

function isIncomplete(text) {
  const fences = (text.match(/```/g) || []).length;
  return fences % 2 !== 0;
}

function showContinueButton(bubble) {
  const box = document.createElement("div");
  box.className = "continue-box";

  const btn = document.createElement("button");
  btn.textContent = "↻ Continue";
  btn.onclick = () => {
    box.remove();
    sendContinue();
  };

  box.appendChild(btn);
  bubble.appendChild(box);
}

/* ---------------- stream core ---------------- */

function startStream(message) {
  const assistantBubble = addMessage("assistant", "");
  let full = "";

  stopBtn.disabled = false;

  eventSource = new EventSource(
    `/api/chat/stream?message=${encodeURIComponent(message)}&conversation_id=${conversationId}`
  );

  eventSource.onmessage = (e) => {
    if (e.data === "[DONE]") {
      eventSource.close();
      eventSource = null;
      stopBtn.disabled = true;

      assistantBubble.innerHTML = parseMessage(full);
      hljs.highlightAll();

      if (isIncomplete(full)) {
        showContinueButton(assistantBubble);
      }
      return;
    }

    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }

    // 🔥 conversation memory FIX
    if (data.conversation_id && !conversationId) {
      conversationId = data.conversation_id;
      localStorage.setItem("conversation_id", conversationId);
    }

    if (data.content) {
      full += data.content;
      assistantBubble.textContent = full; // live typing
    }
  };
}

/* ---------------- send ---------------- */

sendBtn.onclick = () => {
  const text = userInput.value.trim();
  if (!text || eventSource) return;

  userInput.value = "";
  addMessage("user", escapeHtml(text));
  startStream(text);
};

stopBtn.onclick = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    stopBtn.disabled = true;
  }
};

/* ---------------- continue ---------------- */

function sendContinue() {
  if (eventSource) return;
  startStream("continue from where you stopped, do not repeat previous content");
}

/* ---------------- sidebar ---------------- */

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