const { invoke } = window.__TAURI__.core;

async function refresh() {
  const ids = await invoke("get_note_ids");
  const list = document.getElementById("list");
  list.innerHTML = ids.length
    ? ids.map((id) => `<li data-id="${id}">${id}</li>`).join("")
    : "<li style='color:#888'>No memos yet</li>";
  list.querySelectorAll("li[data-id]").forEach((el) => {
    el.onclick = () => invoke("focus_note", { label: el.dataset.id });
  });
}

document.getElementById("new-note").onclick = () => invoke("create_new_note");

refresh();
window.addEventListener("focus", refresh);
