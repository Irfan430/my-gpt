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

/* ---------- helpers ---------- */

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

function parseMessage(text) {
  const parts = text.split(/```/);
  let out = "";

  parts.forEach((p, i) => {
    if (i % 2 === 0) {
      out += `<div>${escapeHtml(p)}</div>`;
    } else {
      const lines = p.split("\n");
      const lang = lines.shift() || "text";
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

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])
  );
}

window.copyCode = (btn) => {
  navigator.clipboard.writeText(
    btn.parentElement.nextElementSibling.innerText
  );
  btn.innerText = "✓";
  setTimeout(() => btn.innerText = "Copy", 1000);
};

/* ---------- send ---------- */

sendBtn.onclick = () => {
  const text = userInput.value.trim();
  if (!text || eventSource) return;

  userInput.value = "";
  addMessage("user", escapeHtml(text));

  stopBtn.disabled = false;

  const assistantBubble = addMessage("assistant", "");
  let full = "";

  eventSource = new EventSource(
    `/api/chat/stream?message=${encodeURIComponent(text)}&conversation_id=${conversationId}`
  );

  eventSource.onmessage = (e) => {
    if (e.data === "[DONE]") {
      eventSource.close();
      eventSource = null;
      stopBtn.disabled = true;

      assistantBubble.innerHTML = parseMessage(full);
      hljs.highlightAll();
      return;
    }

    const data = JSON.parse(e.data);
    if (data.content) {
      full += data.content;
      assistantBubble.textContent = full; // live typing (plain)
    }
  };
};

stopBtn.onclick = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    stopBtn.disabled = true;
  }
};

/* ---------- sidebar ---------- */

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