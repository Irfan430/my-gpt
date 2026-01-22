let eventSource = null;
let conversationId = localStorage.getItem("conversation_id") || "";
let currentAssistantBubble = null;
let fullText = "";
let streaming = false;

/* ---------------- helpers ---------------- */

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

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])
  );
}

/* ---------------- markdown + code ---------------- */

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
          <pre><code>${escapeHtml(code)}</code></pre>
        </div>`;
    }
  });

  return html;
}

window.copyCode = btn => {
  const code = btn.parentElement.nextElementSibling.innerText;
  navigator.clipboard.writeText(code);
  btn.innerText = "✓";
  setTimeout(() => (btn.innerText = "Copy"), 1000);
};

/* ---------------- incomplete detect ---------------- */

function isIncomplete(text) {
  const fences = (text.match(/```/g) || []).length;
  if (fences % 2 !== 0) return true;

  const last = text.trim().split("\n").pop();
  return last && !/[.!?]$/.test(last);
}

/* ---------------- Continue Button ---------------- */

function showContinue() {
  removeContinue();

  const box = document.createElement("div");
  box.className = "continue-box";

  const btn = document.createElement("button");
  btn.textContent = "↻ Continue";
  btn.onclick = () => {
    removeContinue();
    startStream("__CONTINUE__", true);
  };

  box.appendChild(btn);
  currentAssistantBubble.appendChild(box);
}

function removeContinue() {
  const old = currentAssistantBubble?.querySelector(".continue-box");
  if (old) old.remove();
}

/* ---------------- Streaming Core ---------------- */

function startStream(message, isContinue = false) {
  if (streaming) return;

  streaming = true;

  if (!isContinue) {
    addMessage("user", escapeHtml(message));
    currentAssistantBubble = addMessage("assistant", "");
    fullText = "";
  }

  const url =
    `/api/chat/stream?message=${encodeURIComponent(
      isContinue
        ? "continue from where you stopped, do not repeat"
        : message
    )}&conversation_id=${conversationId}`;

  eventSource = new EventSource(url);

  eventSource.onmessage = e => {
    if (e.data === "[DONE]") {
      eventSource.close();
      eventSource = null;
      streaming = false;

      currentAssistantBubble.innerHTML = renderMessage(fullText);
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
      currentAssistantBubble.textContent = fullText; // live typing
    }
  };
}

/* ---------------- UI Actions ---------------- */

sendBtn.onclick = () => {
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = "";
  startStream(text);
};

stopBtn.onclick = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    streaming = false;
    if (isIncomplete(fullText)) showContinue();
  }
};

/* ---------------- Sidebar Toggle (3-state FIXED) ---------------- */

let sidebarState = 0;
toggleSidebar.onclick = () => {
  sidebarState = (sidebarState + 1) % 3;
  sidebar.classList.remove("hidden", "compact");

  if (sidebarState === 0) sidebar.classList.add("hidden");
  if (sidebarState === 1) sidebar.classList.add("compact");
};