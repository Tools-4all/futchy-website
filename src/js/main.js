// FUTCHY — futchy.co. No frameworks, no analytics, no storage, no network calls.
(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.querySelector("[data-header]");
  const heroMedia = document.querySelector("[data-hero-media]");
  const parallax = [...document.querySelectorAll("[data-parallax]")];

  // The App Store link is not live yet: the button looks complete but goes nowhere.
  document.querySelectorAll("[data-cta-pending]").forEach((b) => b.addEventListener("click", (e) => e.preventDefault()));

  // Reveal on scroll
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  // Sticky header + light parallax (one rAF-throttled scroll handler)
  let ticking = false;
  const visible = new Set();
  if ("IntersectionObserver" in window) {
    const vio = new IntersectionObserver((entries) => {
      for (const en of entries) en.isIntersecting ? visible.add(en.target) : visible.delete(en.target);
    }, { rootMargin: "20% 0px" });
    parallax.forEach((el) => vio.observe(el));
  }

  function frame() {
    ticking = false;
    const y = window.scrollY;
    if (header) header.classList.toggle("is-solid", y > 40);
    if (reduce) return;
    if (heroMedia && y < window.innerHeight * 1.2) heroMedia.style.setProperty("--p", (y * 0.22).toFixed(1));
    const vh = window.innerHeight;
    for (const el of visible) {
      const amp = Number(el.dataset.parallax) || 20;
      const r = el.getBoundingClientRect();
      const t = (r.top + r.height / 2 - vh / 2) / vh; // -1..1 across the viewport
      el.style.setProperty("--py", (-t * amp).toFixed(1) + "px");
    }
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  frame();

  // Trailer: nothing loads until the visitor asks; never autoplays; sound only on their tap.
  const t = document.querySelector("[data-trailer]");
  const playBtn = document.querySelector("[data-trailer-play]");
  if (t && playBtn) {
    playBtn.addEventListener("click", () => {
      const v = document.createElement("video");
      v.src = t.dataset.video;
      if (t.dataset.poster) v.poster = t.dataset.poster;
      v.controls = true;
      v.playsInline = true;
      v.preload = "auto";
      v.setAttribute("aria-label", "FUTCHY launch trailer");
      t.replaceChildren(v);
      v.play().catch(() => {});
      v.focus();
    });
  }
})();
