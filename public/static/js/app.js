let conversation_id = localStorage.getItem("conversation_id") || "";
const messages = document.getElementById("messages");

function toggleSidebar(){
  document.getElementById("sidebar").classList.toggle("show");
}

function add(text, cls){
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function send(){
  const input = document.getElementById("input");
  const text = input.value.trim();
  if(!text) return;

  add(text,"user");
  input.value = "";

  const url = `/api/chat/stream?message=${encodeURIComponent(text)}&conversation_id=${conversation_id}`;
  const es = new EventSource(url);

  let botText = "";
  const botDiv = document.createElement("div");
  botDiv.className = "msg bot";
  messages.appendChild(botDiv);

  es.onmessage = (e)=>{
    if(e.data === "[DONE]"){
      es.close();
      return;
    }
    const data = JSON.parse(e.data);
    if(data.content){
      botText += data.content;
      botDiv.textContent = botText;
      messages.scrollTop = messages.scrollHeight;
    }
    if(data.conversation_id){
      conversation_id = data.conversation_id;
      localStorage.setItem("conversation_id", conversation_id);
    }
  };
}

function newChat(){
  localStorage.removeItem("conversation_id");
  conversation_id = "";
  messages.innerHTML = "";
}
