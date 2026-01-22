let chatArea = document.getElementById("chatArea");
let userInput = document.getElementById("userInput");
let sendBtn = document.getElementById("sendBtn");
let stopBtn = document.getElementById("stopBtn");
let newChatBtn = document.getElementById("newChatBtn");

let eventSource = null;
let conversationId = localStorage.getItem("conversation_id") || "";

function addMessage(role, html) {
  const msg = document.createElement("div");
  msg.className = "message " + role;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = html;

  msg.appendChild(bubble);
  chatArea.appendChild(msg);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function parseAssistantMessage(text) {
  const parts = text.split(/```/);
  let html = "";

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      html += `<div>${parts[i]}</div>`;
    } else {
      const lines = parts[i].split("\n");
      const lang = lines.shift().trim() || "text";
      const code = lines.join("\n");

      html += `
        <div class="code-block">
          <div class="code-header">
            <span>${lang}</span>
            <button onclick="copyCode(this)">Copy</button>
          </div>
          <pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>
        </div>
      `;
    }
  }

  return html;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}

window.copyCode = function (btn) {
  const code = btn.parentElement.nextElementSibling.innerText;
  navigator.clipboard.writeText(code);
  btn.innerText = "Copied ✓";
  setTimeout(() => (btn.innerText = "Copy"), 1200);
};

sendBtn.onclick = () => {
  const text = userInput.value.trim();
  if (!text || eventSource) return;

  userInput.value = "";
  addMessage("user", text);

  stopBtn.disabled = false;

  eventSource = new EventSource(
    `/api/chat/stream?message=${encodeURIComponent(text)}&conversation_id=${conversationId}`
  );

  let fullReply = "";

  eventSource.onmessage = (e) => {
    if (e.data === "[DONE]") {
      eventSource.close();
      eventSource = null;
      stopBtn.disabled = true;
      addMessage("assistant", parseAssistantMessage(fullReply));
      hljs.highlightAll();
      return;
    }

    const data = JSON.parse(e.data);
    if (data.content) {
      fullReply += data.content;
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

newChatBtn.onclick = () => {
  conversationId = "";
  localStorage.removeItem("conversation_id");
  chatArea.innerHTML = "";
};