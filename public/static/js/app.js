let conversationId = "";
let eventSource = null;

const messages = document.getElementById("messages");
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const convList = document.getElementById("conversationList");
const newChatBtn = document.getElementById("newChat");

/* ---------- helpers ---------- */
function addMessage(text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

/* ---------- conversations ---------- */
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
      messages.innerHTML = "";
      c.messages.forEach(m => {
        addMessage(m.content, m.role === "user" ? "user" : "bot");
      });
    });
}

/* ---------- send message ---------- */
sendBtn.onclick = () => {
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  addMessage(text, "user");

  if (eventSource) eventSource.close();

  sendBtn.disabled = true;
  stopBtn.disabled = false;

  const botMsg = addMessage("", "bot");

  const url =
    `/api/chat/stream?message=${encodeURIComponent(text)}` +
    (conversationId ? `&conversation_id=${conversationId}` : "");

  eventSource = new EventSource(url);

  eventSource.onmessage = e => {
    if (e.data === "[DONE]") {
      eventSource.close();
      sendBtn.disabled = false;
      stopBtn.disabled = true;
      loadConversations();
      return;
    }

    const data = JSON.parse(e.data);
    if (data.error) {
      botMsg.textContent += "\n" + data.error;
    }
    if (data.content) {
      botMsg.textContent += data.content;
    }
  };
};

/* ---------- stop ---------- */
stopBtn.onclick = () => {
  if (eventSource) {
    eventSource.close();
    sendBtn.disabled = false;
    stopBtn.disabled = true;
  }
};

/* ---------- new chat ---------- */
newChatBtn.onclick = () => {
  conversationId = "";
  messages.innerHTML = "";
};

/* init */
loadConversations();