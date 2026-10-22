import { BOOKS } from "./catalog.js";

const grid = document.querySelector("#book-grid");
const progressKey = (id) => "jianpan-book-progress-" + id;

function render(grade = "all") {
  const books = grade === "all" ? BOOKS : BOOKS.filter((book) => String(book.grade) === grade);
  grid.innerHTML = books.map((book) => {
    const saved = JSON.parse(localStorage.getItem(progressKey(book.id)) || "null");
    const progress = saved && saved.page > 1
      ? `<span class="reading-progress">读到第 ${saved.page} 页</span>`
      : `<span class="reading-progress new">开始阅读</span>`;
    return `<a class="book-card" href="reader.html?id=${encodeURIComponent(book.id)}">
      <span class="book-cover"><img src="${book.cover}" alt="${book.title}封面" loading="lazy"></span>
      <span class="book-info"><strong>${book.id} · ${book.title}</strong>${progress}</span>
    </a>`;
  }).join("");
}

document.querySelector("#grade-filters").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-grade]");
  if (!button) return;
  document.querySelectorAll("#grade-filters button").forEach((item) => item.classList.toggle("active", item === button));
  render(button.dataset.grade);
});

render();
