import * as pdfjsLib from "./vendor/pdf.js";
import { BOOKS } from "./catalog.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.js", import.meta.url).href;

const params = new URLSearchParams(location.search);
const book = BOOKS.find((item) => item.id === params.get("id"));
const canvas = document.querySelector("#pdf-canvas");
const pageImage = document.querySelector("#page-image");
const context = canvas.getContext("2d", { alpha: false });
const stage = document.querySelector("#page-stage");
const pageInput = document.querySelector("#page-number");
const loading = document.querySelector("#loading");
const errorBox = document.querySelector("#reader-error");
const exitImmersive = document.querySelector("#exit-immersive");
const pdfVersion = "20260830-2";
let pdf = null;
let pageNumber = 1;
let zoom = 1;
let renderTask = null;
let renderToken = 0;
let touchStartX = 0;
let touchStartY = 0;
const progressKey = book ? "jianpan-book-progress-" + book.id : "";

function showError(message) {
  loading.classList.add("hidden");
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function updateControls() {
  const totalPages = book && book.pages ? book.pages : (pdf ? pdf.numPages : 0);
  pageInput.value = pageNumber;
  document.querySelector("#prev-page").disabled = pageNumber <= 1;
  document.querySelector("#next-page").disabled = !totalPages || pageNumber >= totalPages;
  document.querySelector("#zoom-label").textContent = Math.round(zoom * 100) + "%";
}

function imageUrl(number) {
  return `${book.imageBase}/${String(number).padStart(3, "0")}.webp`;
}

function preloadNearbyImages() {
  [pageNumber - 1, pageNumber + 1].forEach((number) => {
    if (number < 1 || number > book.pages) return;
    const preload = new Image();
    preload.src = imageUrl(number);
  });
}

async function renderImagePage() {
  const token = ++renderToken;
  loading.classList.remove("hidden");
  const nextImage = new Image();
  nextImage.src = imageUrl(pageNumber);
  try {
    await nextImage.decode();
    if (token !== renderToken) return;
    const widthScale = (stage.clientWidth - 28) / nextImage.naturalWidth;
    const heightScale = (stage.clientHeight - 46) / nextImage.naturalHeight;
    const fitScale = Math.max(0.25, Math.min(widthScale, heightScale));
    pageImage.src = nextImage.src;
    pageImage.style.width = Math.floor(nextImage.naturalWidth * fitScale * zoom) + "px";
    pageImage.style.height = Math.floor(nextImage.naturalHeight * fitScale * zoom) + "px";
    pageImage.classList.remove("hidden");
    canvas.classList.add("hidden");
    loading.classList.add("hidden");
    localStorage.setItem(progressKey, JSON.stringify({ page: pageNumber, total: book.pages, updatedAt: Date.now() }));
    history.replaceState(null, "", "?id=" + encodeURIComponent(book.id) + "&page=" + pageNumber);
    preloadNearbyImages();
    updateControls();
  } catch (error) {
    showError("这一页加载失败，请刷新后重试。");
  }
}

async function renderPage() {
  if (book && book.imageBase) return renderImagePage();
  if (!pdf) return;
  const token = ++renderToken;
  if (renderTask) renderTask.cancel();
  const page = await pdf.getPage(pageNumber);
  if (token !== renderToken) return;
  const natural = page.getViewport({ scale: 1 });
  const widthScale = (stage.clientWidth - 28) / natural.width;
  const heightScale = (stage.clientHeight - 46) / natural.height;
  const fitScale = Math.max(0.25, Math.min(widthScale, heightScale));
  const viewport = page.getViewport({ scale: fitScale * zoom });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = Math.floor(viewport.width) + "px";
  canvas.style.height = Math.floor(viewport.height) + "px";
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  loading.classList.remove("hidden");
  renderTask = page.render({ canvasContext: context, viewport });
  try {
    await renderTask.promise;
    if (token !== renderToken) return;
    loading.classList.add("hidden");
    localStorage.setItem(progressKey, JSON.stringify({ page: pageNumber, total: pdf.numPages, updatedAt: Date.now() }));
    history.replaceState(null, "", "?id=" + encodeURIComponent(book.id) + "&page=" + pageNumber);
  } catch (error) {
    if (error && error.name !== "RenderingCancelledException") showError("这一页加载失败，请刷新后重试。");
  }
  updateControls();
}

function goToPage(next) {
  const totalPages = book && book.pages ? book.pages : (pdf ? pdf.numPages : 0);
  if (!totalPages) return;
  pageNumber = Math.max(1, Math.min(totalPages, Number(next) || 1));
  stage.scrollTo({ top: 0, behavior: "smooth" });
  renderPage();
}

async function openBook() {
  if (!book) return showError("没有找到这本课本，请返回书架重新选择。");
  document.title = book.title + " · 在线阅读";
  document.querySelector("#book-title").textContent = book.id + " · " + book.title;
  const saved = JSON.parse(localStorage.getItem(progressKey) || "null");
  const requested = Number(params.get("page"));
  pageNumber = requested || (saved && saved.page) || 1;
  if (book.imageBase && book.pages) {
    pageNumber = Math.min(pageNumber, book.pages);
    pageInput.max = book.pages;
    document.querySelector("#page-count").textContent = book.pages;
    return renderPage();
  }
  try {
    pdf = await pdfjsLib.getDocument({
      url: book.pdf + "?v=" + pdfVersion,
      /* 自建（不走官方 CDN）的 pdf.js 必须自己配这三项，不然复杂 PDF（内嵌 CJK 字体 / JPEG2000 扫描图）
         该用的 cmap/字体/wasm 解码器都找不到，会静默走坏掉的兜底路径，页面加载巨慢甚至部分内容出不来 */
      cMapUrl: new URL("./vendor/cmaps/", import.meta.url).href,
      cMapPacked: true,
      standardFontDataUrl: new URL("./vendor/standard_fonts/", import.meta.url).href,
      wasmUrl: new URL("./vendor/wasm/", import.meta.url).href,
      iccUrl: new URL("./vendor/iccs/", import.meta.url).href
    }).promise;
    pageNumber = Math.min(pageNumber, pdf.numPages);
    pageInput.max = pdf.numPages;
    document.querySelector("#page-count").textContent = pdf.numPages;
    await renderPage();
  } catch (error) {
    console.error(error);
    showError("课本加载失败，请检查网络后重试。");
  }
}

document.querySelector("#prev-page").addEventListener("click", () => goToPage(pageNumber - 1));
document.querySelector("#next-page").addEventListener("click", () => goToPage(pageNumber + 1));
pageInput.addEventListener("change", () => goToPage(pageInput.value));
document.querySelector("#zoom-out").addEventListener("click", () => { zoom = Math.max(0.6, zoom - 0.2); renderPage(); });
document.querySelector("#zoom-in").addEventListener("click", () => { zoom = Math.min(2.4, zoom + 0.2); renderPage(); });
function setImmersive(enabled) {
  document.body.classList.toggle("immersive", enabled);
  exitImmersive.classList.toggle("hidden", !enabled);
  setTimeout(renderPage, 80);
}

document.querySelector("#fullscreen").addEventListener("click", async () => {
  if (document.fullscreenElement) return document.exitFullscreen();
  if (document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
      return;
    } catch (error) {
      // Mobile Safari falls back to an in-page immersive mode.
    }
  }
  setImmersive(true);
});
exitImmersive.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  setImmersive(false);
});
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) setTimeout(renderPage, 80);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "PageUp") goToPage(pageNumber - 1);
  if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") goToPage(pageNumber + 1);
});
stage.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].clientX;
  touchStartY = event.changedTouches[0].clientY;
}, { passive: true });
stage.addEventListener("touchend", (event) => {
  const distanceX = event.changedTouches[0].clientX - touchStartX;
  const distanceY = event.changedTouches[0].clientY - touchStartY;
  if (Math.abs(distanceX) > 50 && Math.abs(distanceX) > Math.abs(distanceY) * 1.3) {
    goToPage(pageNumber + (distanceX < 0 ? 1 : -1));
  }
}, { passive: true });
let resizeTimer = null;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderPage, 160); });

openBook();
