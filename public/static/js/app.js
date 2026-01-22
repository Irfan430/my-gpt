let conversationId = "";
let eventSource = null;

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const convList = document.getElementById("conversationList");
const newChatBtn = document.getElementById("newChat");

/* Add message bubble */
function addMessage(text, cls) {
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

/* Load conversations */
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

/* Load single conversation */
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

/* Send message */
sendBtn.onclick = () => {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = "";
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

/* Stop streaming */
stopBtn.onclick = () => {
  if (eventSource) {
    eventSource.close();
    sendBtn.disabled = false;
    stopBtn.disabled = true;
  }
};

/* New chat */
newChatBtn.onclick = () => {
  conversationId = "";
  messagesEl.innerHTML = "";
};

/* Init */
loadConversations();