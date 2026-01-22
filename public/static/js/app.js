let eventSource = null;
let conversationId = localStorage.getItem("conversation_id") || "";

let currentMode = "text";   // text | code
let currentCodeLang = "";
let currentTextDiv = null;
let currentCodePre = null;

/* ---------- helpers ---------- */

function addAssistantContainer() {
  const msg = document.createElement("div");
  msg.className = "message assistant";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  msg.appendChild(bubble);
  chatArea.appendChild(msg);
  chatArea.scrollTop = chatArea.scrollHeight;

  return bubble;
}

function startTextBlock(parent) {
  const div = document.createElement("div");
  parent.appendChild(div);
  return div;
}

function startCodeBlock(parent, lang) {
  const wrapper = document.createElement("div");
  wrapper.className = "code-block";

  const header = document.createElement("div");
  header.className = "code-header";
  header.innerHTML = `<span>${lang || "code"}</span>`;

  const btn = document.createElement("button");
  btn.textContent = "Copy";
  btn.onclick = () => {
    navigator.clipboard.writeText(code.innerText);
    btn.textContent = "✓";
    setTimeout(() => (btn.textContent = "Copy"), 1000);
  };

  header.appendChild(btn);

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  if (lang) code.className = `language-${lang}`;

  pre.appendChild(code);
  wrapper.appendChild(header);
  wrapper.appendChild(pre);
  parent.appendChild(wrapper);

  return code;
}

/* ---------- STREAM SEND ---------- */

sendBtn.onclick = () => {
  const text = userInput.value.trim();
  if (!text || eventSource) return;

  userInput.value = "";
  addMessage("user", text);

  stopBtn.disabled = false;

  const bubble = addAssistantContainer();
  currentTextDiv = startTextBlock(bubble);

  currentMode = "text";
  currentCodeLang = "";
  currentCodePre = null;

  eventSource = new EventSource(
    `/api/chat/stream?message=${encodeURIComponent(text)}&conversation_id=${conversationId}`
  );

  let buffer = "";

  eventSource.onmessage = (e) => {
    if (e.data === "[DONE]") {
      eventSource.close();
      eventSource = null;
      stopBtn.disabled = true;
      hljs.highlightAll();
      return;
    }

    const data = JSON.parse(e.data);
    if (!data.content) return;

    buffer += data.content;

    while (true) {
      const fenceIndex = buffer.indexOf("```");
      if (fenceIndex === -1) break;

      const before = buffer.slice(0, fenceIndex);
      const after = buffer.slice(fenceIndex + 3);

      if (currentMode === "text") {
        currentTextDiv.textContent += before;

        const firstLineEnd = after.indexOf("\n");
        currentCodeLang =
          firstLineEnd !== -1 ? after.slice(0, firstLineEnd).trim() : "";

        currentCodePre = startCodeBlock(bubble, currentCodeLang);
        currentMode = "code";

        buffer = firstLineEnd !== -1 ? after.slice(firstLineEnd + 1) : "";
      } else {
        currentCodePre.textContent += before;
        currentTextDiv = startTextBlock(bubble);
        currentMode = "text";
        buffer = after;
      }
    }

    if (buffer.length) {
      if (currentMode === "text") {
        currentTextDiv.textContent += buffer;
      } else {
        currentCodePre.textContent += buffer;
      }
      buffer = "";
    }

    chatArea.scrollTop = chatArea.scrollHeight;
  };
};

stopBtn.onclick = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    stopBtn.disabled = true;
  }
};