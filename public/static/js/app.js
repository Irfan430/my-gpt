let conversation_id = localStorage.getItem("conversation_id") || "";
let eventSource = null;
let streaming = false;

const messages = document.getElementById("messages");
const convList = document.getElementById("conversationList");
const banner = document.getElementById("banner");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const status = document.getElementById("status");

function toggleSidebar(){
  document.getElementById("sidebar").classList.toggle("show");
}

function newChat(){
  conversation_id = "";
  localStorage.removeItem("conversation_id");
  messages.innerHTML="";
  banner.classList.add("hidden");
  status.textContent="New chat";
}

function stopStream(){
  if(eventSource){
    eventSource.close();
    streaming=false;
    sendBtn.disabled=false;
    stopBtn.classList.add("hidden");
    status.textContent="Stopped";
  }
}

function loadConversations(){
  fetch("/api/conversations")
    .then(r=>r.json())
    .then(list=>{
      convList.innerHTML="";
      list.forEach(c=>{
        const d=document.createElement("div");
        d.className="conv";
        d.textContent=c.title;
        d.onclick=()=>loadConversation(c.id);
        convList.appendChild(d);
      });
    });
}

function loadConversation(id){
  fetch(`/api/conversation/${id}`)
    .then(r=>r.json())
    .then(c=>{
      conversation_id=id;
      localStorage.setItem("conversation_id",id);
      messages.innerHTML="";
      c.messages.forEach(m=>render(m.content,m.role==="user"?"user":"bot"));
      banner.classList.remove("hidden");
    });
}

function parseMarkdown(text,container){
  const parts=text.split(/```/);
  parts.forEach((p,i)=>{
    if(i%2){
      const lines=p.split("\n");
      const lang=lines.shift();
      const code=lines.join("\n");
      const header=document.createElement("div");
      header.className="code-header";
      header.innerHTML=`<span>${lang}</span>`;
      const btn=document.createElement("button");
      btn.className="copy-btn";
      btn.textContent="Copy";
      btn.onclick=()=>navigator.clipboard.writeText(code);
      header.appendChild(btn);
      const pre=document.createElement("pre");
      pre.textContent=code;
      container.appendChild(header);
      container.appendChild(pre);
    }else{
      const ptag=document.createElement("p");
      ptag.textContent=p;
      if(/error|exception|traceback/i.test(p)) ptag.classList.add("error");
      container.appendChild(ptag);
    }
  });
}

function render(text,cls){
  const div=document.createElement("div");
  div.className="msg "+cls;
  parseMarkdown(text,div);

  if(cls==="bot"){
    const act=document.createElement("div");
    act.className="actions";
    const copy=document.createElement("button");
    copy.textContent="Copy";
    copy.onclick=()=>navigator.clipboard.writeText(text);
    const regen=document.createElement("button");
    regen.textContent="Regenerate";
    regen.onclick=()=>send(text);
    act.appendChild(copy);
    act.appendChild(regen);
    div.appendChild(act);
  }

  messages.appendChild(div);
  messages.scrollTop=messages.scrollHeight;
}

function send(textOverride=null){
  if(streaming) return;

  const input=document.getElementById("input");
  const text=textOverride || input.value.trim();
  if(!text) return;

  render(text,"user");
  input.value="";

  sendBtn.disabled=true;
  stopBtn.classList.remove("hidden");
  streaming=true;
  status.textContent="Streaming…";

  const url=`/api/chat/stream?message=${encodeURIComponent(text)}&conversation_id=${conversation_id}`;
  eventSource=new EventSource(url);

  let botText="";
  const botDiv=document.createElement("div");
  botDiv.className="msg bot";
  messages.appendChild(botDiv);

  eventSource.onmessage=e=>{
    if(e.data==="[DONE]"){
      eventSource.close();
      streaming=false;
      sendBtn.disabled=false;
      stopBtn.classList.add("hidden");
      status.textContent="Ready";
      return;
    }
    const d=JSON.parse(e.data);
    if(d.content){
      botText+=d.content;
      botDiv.innerHTML="";
      parseMarkdown(botText,botDiv);
    }
    if(d.conversation_id){
      conversation_id=d.conversation_id;
      localStorage.setItem("conversation_id",conversation_id);
      loadConversations();
    }
  };
}

loadConversations();
if(conversation_id) banner.classList.remove("hidden");