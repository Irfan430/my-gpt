let conversationId = "";
let eventSource = null;

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const convList = document.getElementById("conversationList");
const newChatBtn = document.getElementById("newChat");

/* ---------- Render message with code support ---------- */
function renderBotMessage(container, text) {
  const parts = text.split(/```/);

  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part.trim()) {
        const p = document.createElement("div");
        p.textContent = part;
        container.appendChild(p);
      }
    } else {
      const block = document.createElement("div");
      block.className = "code-block";

      const header = document.createElement("div");
      header.className = "code-header";

      const label = document.createElement("span");
      label.textContent = "code";

      const copy = document.createElement("span");
      copy.className = "copy-btn";
      copy.textContent = "Copy";

      copy.onclick = () => {
        navigator.clipboard.writeText(part);
        copy.textContent = "Copied";
        setTimeout(() => copy.textContent = "Copy", 1000);
      };

      header.appendChild(label);
      header.appendChild(copy);

      const pre = document.createElement("pre");
      pre.textContent = part;

      block.appendChild(header);
      block.appendChild(pre);
      container.appendChild(block);
    }
  });
}

/* ---------- Simple bubble ---------- */
function addMessage(text, cls) {
  const div = document.createElement("div");
  div.className = "msg " + cls;

  if (cls === "bot") {
    renderBotMessage(div, text);
  } else {
    div.textContent = text;
  }

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

/* ---------- Conversations ---------- */
function loadConversations() {
  fetch("/api/conversations")
    .then(r => r.json())
    .then(list => {
      convList.innerHTML = "";
      list.forEach(c => {
        const d = document.createElement("div");
        d.className = "conv";
        d.textContent = c.title || "Conversation";
        d.onclick = () => loadConversation(c.id);
        convList.appendChild(d);
      });
    });
}

function loadConversation(id) {
  fetch(`/api/conversation/${id}`)
    .then(r => r.json())
    .then(c => {
      conversationId = c.id;
      messagesEl.innerHTML = "";
      c.messages.forEach(m => {
        addMessage(m.content, m.role === "user" ? "user" : "bot");
      });
    });
}

/* ---------- Send ---------- */
sendBtn.onclick = () => {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = "";
  addMessage(text, "user");

  if (eventSource) eventSource.close();

  sendBtn.disabled = true;
  stopBtn.disabled = false;

  let buffer = "";
  const botDiv = document.createElement("div");
  botDiv.className = "msg bot";
  messagesEl.appendChild(botDiv);

  const url =
    `/api/chat/stream?message=${encodeURIComponent(text)}` +
    (conversationId ? `&conversation_id=${conversationId}` : "");

  eventSource = new EventSource(url);

  eventSource.onmessage = e => {
    if (e.data === "[DONE]") {
      botDiv.innerHTML = "";
      renderBotMessage(botDiv, buffer);
      sendBtn.disabled = false;
      stopBtn.disabled = true;
      loadConversations();
      return;
    }

    const data = JSON.parse(e.data);
    if (data.content) buffer += data.content;
  };
};

/* ---------- Stop ---------- */
stopBtn.onclick = () => {
  if (eventSource) {
    eventSource.close();
    sendBtn.disabled = false;
    stopBtn.disabled = true;
  }
};

/* ---------- New chat ---------- */
newChatBtn.onclick = () => {
  conversationId = "";
  messagesEl.innerHTML = "";
};

loadConversations();