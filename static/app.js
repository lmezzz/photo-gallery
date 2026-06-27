let currentPath = "";
let currentImages = [];
let lightboxIndex = 0;

const tilts = [-2.5, -1.2, 0.8, 2.1, -0.5, 1.8, -1.8, 0.4];

async function get_content(path) {
  currentPath = path;
  try {
    const res = await fetch(`/api?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();

    render_breadcrumb(path);
    render_folders(data.folders);
    render_images(data.images);
    currentImages = data.images;

    const hasFolders = data.folders && data.folders.length > 0;
    const hasImages  = data.images  && data.images.length  > 0;

    document.getElementById("folders-section").classList.toggle("hidden", !hasFolders);
    document.getElementById("images-section").classList.toggle("hidden",  !hasImages);
    document.getElementById("empty-state").classList.toggle("hidden", hasFolders || hasImages);

  } catch (e) {
    console.error("fetch failed:", e);
  }
}

function goHome() {
  get_content("");
}

function render_breadcrumb(path) {
  const nav = document.getElementById("breadcrumb");
  nav.innerHTML = "";

  const home = document.createElement("span");
  home.className = "crumb";
  home.textContent = "home";
  home.onclick = () => get_content("");
  nav.appendChild(home);

  if (!path) return;

  const parts = path.split("/").filter(Boolean);
  parts.forEach((part, i) => {
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = " / ";
    nav.appendChild(sep);

    const crumb = document.createElement("span");
    const isLast = i === parts.length - 1;
    crumb.className = isLast ? "crumb-current" : "crumb";
    crumb.textContent = part;
    if (!isLast) {
      const crumbPath = parts.slice(0, i + 1).join("/");
      crumb.onclick = () => get_content(crumbPath);
    }
    nav.appendChild(crumb);
  });
}

function render_folders(folders) {
  const container = document.getElementById("folders");
  container.innerHTML = "";
  if (!folders) return;

  folders.forEach(folder => {
    const name = folder.split("/").pop();
    const card = document.createElement("div");
    card.className = "folder-card";

    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.textContent = "📁";

    const label = document.createElement("span");
    label.className = "folder-name";
    label.textContent = name;

    card.appendChild(icon);
    card.appendChild(label);
    card.onclick = () => get_content(folder);
    container.appendChild(card);
  });
}

function render_images(images) {
  const container = document.getElementById("images");
  container.innerHTML = "";
  if (!images) return;

  images.forEach((imgPath, i) => {
    const name = imgPath.split("/").pop().replace(/\.[^.]+$/, "");
    const tilt = tilts[i % tilts.length];

    const polaroid = document.createElement("div");
    polaroid.className = "polaroid";
    polaroid.style.setProperty("--tilt", `${tilt}deg`);

    const img = document.createElement("img");
    img.alt = name;
    img.loading = "lazy";
    img.src = `/photos/${imgPath}`;

    const label = document.createElement("p");
    label.className = "polaroid-label";
    label.textContent = name;

    polaroid.appendChild(img);
    polaroid.appendChild(label);
    polaroid.onclick = () => openLightbox(i);
    container.appendChild(polaroid);
  });
}

function openLightbox(index) {
  lightboxIndex = index;
  const lb = document.getElementById("lightbox");
  const img = document.getElementById("lb-img");
  const caption = document.getElementById("lb-caption");
  const path = currentImages[index];

  img.src = `/photos/${path}`;
  caption.textContent = path.split("/").pop().replace(/\.[^.]+$/, "");
  lb.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden");
  document.body.style.overflow = "";
}

function shiftLightbox(dir) {
  lightboxIndex = (lightboxIndex + dir + currentImages.length) % currentImages.length;
  openLightbox(lightboxIndex);
}

document.addEventListener("keydown", e => {
  const lb = document.getElementById("lightbox");
  if (lb.classList.contains("hidden")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowRight") shiftLightbox(1);
  if (e.key === "ArrowLeft")  shiftLightbox(-1);
});

get_content("");
