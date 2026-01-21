let conversation_id = localStorage.getItem("conversation_id") || "";
const messages = document.getElementById("messages");
const convList = document.getElementById("conversationList");

function toggleSidebar(){
  document.getElementById("sidebar").classList.toggle("show");
}

function newChat(){
  localStorage.removeItem("conversation_id");
  conversation_id = "";
  messages.innerHTML = "";
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
      c.messages.forEach(m=>{
        render(m.content,m.role==="user"?"user":"bot");
      });
    });
}

function render(text,cls){
  const div=document.createElement("div");
  div.className="msg "+cls;
  parseMarkdown(text,div);
  messages.appendChild(div);
  messages.scrollTop=messages.scrollHeight;
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
      container.appendChild(ptag);
    }
  });
}

function send(){
  const input=document.getElementById("input");
  const text=input.value.trim();
  if(!text) return;
  render(text,"user");
  input.value="";

  const url=`/api/chat/stream?message=${encodeURIComponent(text)}&conversation_id=${conversation_id}`;
  const es=new EventSource(url);

  let botText="";
  const botDiv=document.createElement("div");
  botDiv.className="msg bot";
  messages.appendChild(botDiv);

  es.onmessage=e=>{
    if(e.data==="[DONE]"){
      es.close();
      return;
    }
    const d=JSON.parse(e.data);
    if(d.content){
      botText+=d.content;
      botDiv.innerHTML="";
      parseMarkdown(botText,botDiv);
      messages.scrollTop=messages.scrollHeight;
    }
    if(d.conversation_id){
      conversation_id=d.conversation_id;
      localStorage.setItem("conversation_id",conversation_id);
      loadConversations();
    }
  };
}

loadConversations();