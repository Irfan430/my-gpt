const messagesEl = document.getElementById("messages");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const newChatBtn = document.getElementById("newChat");
const convList = document.getElementById("conversationList");

let conversation_id = localStorage.getItem("conversation_id") || "";
let streaming = false;
let eventSource = null;

/* ---------- RENDER ---------- */
function render(text, role){
  const div = document.createElement("div");
  div.className = "msg " + role;

  if(/error|exception|traceback/i.test(text)){
    div.classList.add("error");
  }

  div.innerHTML = format(text);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function format(text){
  return text.replace(/```([\s\S]*?)```/g, (_, code)=>{
    const escaped = code.replace(/</g,"&lt;");
    return `
      <pre>
        <button class="copy-btn" onclick="navigator.clipboard.writeText(\`${escaped}\`)">Copy</button>
        ${escaped}
      </pre>
    `;
  });
}

/* ---------- SEND ---------- */
sendBtn.onclick = ()=>send();
input.addEventListener("keydown",e=>{
  if(e.key==="Enter" && !e.shiftKey){
    e.preventDefault();
    send();
  }
});

function send(){
  if(streaming) return;

  const text = input.value.trim();
  if(!text) return;

  render(text,"user");
  input.value = "";

  streaming = true;
  statusEl.textContent = "Thinking…";
  sendBtn.disabled = true;
  stopBtn.classList.remove("hidden");

  const url = `/api/chat/stream?message=${encodeURIComponent(text)}&conversation_id=${conversation_id}`;
  eventSource = new EventSource(url);

  let full = "";

  eventSource.onmessage = e=>{
    if(e.data === "[DONE]"){
      streaming = false;
      sendBtn.disabled = false;
      stopBtn.classList.add("hidden");
      statusEl.textContent = "Ready";
      eventSource.close();
      return;
    }
    const data = JSON.parse(e.data);
    if(data.content){
      full += data.content;
      if(!document.getElementById("streaming")){
        render("", "bot").id="streaming";
      }
      document.getElementById("streaming").innerHTML = format(full);
    }
  };
}

/* ---------- STOP ---------- */
stopBtn.onclick = ()=>{
  if(eventSource){
    eventSource.close();
    streaming = false;
    conversation_id = "";
    localStorage.removeItem("conversation_id");
    statusEl.textContent = "Stopped (context reset)";
    sendBtn.disabled = false;
    stopBtn.classList.add("hidden");
  }
};

/* ---------- NEW CHAT ---------- */
newChatBtn.onclick = ()=>{
  if(streaming) return;
  conversation_id = "";
  localStorage.removeItem("conversation_id");
  messagesEl.innerHTML = "";
  statusEl.textContent = "New chat";
};

/* ---------- LOAD CONVERSATIONS ---------- */
fetch("/api/conversations")
  .then(r=>r.json())
  .then(list=>{
    convList.innerHTML="";
    list.forEach(c=>{
      const li = document.createElement("li");
      li.textContent = c.title;
      li.onclick = ()=>{
        if(streaming) return;
        conversation_id = c.id;
        localStorage.setItem("conversation_id",conversation_id);
        messagesEl.innerHTML="";
        fetch(`/api/conversation/${c.id}`)
          .then(r=>r.json())
          .then(conv=>{
            conv.messages.forEach(m=>{
              render(m.content, m.role==="user"?"user":"bot");
            });
          });
      };
      convList.appendChild(li);
    });
  });