(function(){
  const root = document.body;
  const toggle = document.getElementById('themeToggle');
  const saved = localStorage.getItem('preferred-theme');
  if (saved === 'light') root.classList.add('light');

  toggle?.addEventListener('click', () => {
    root.classList.toggle('light');
    localStorage.setItem('preferred-theme', root.classList.contains('light') ? 'light' : 'dark');
  });

  // Set current year in footer
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Scroll reveal animations
  const reveals = Array.from(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

    reveals.forEach((el) => io.observe(el));
  } else {
    // Fallback: show all
    reveals.forEach((el) => el.classList.add('in'));
  }

  // Swipe hint logic
  const swipeHint = document.getElementById('swipeHint');
  function maybeShowSwipeHint() {
    const isTouch = matchMedia('(pointer: coarse)').matches;
    if (!swipeHint || !isTouch) return;
    const last = Number(localStorage.getItem('swipe-hint-dismissed-at') || 0);
    const now = Date.now();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    if (last && (now - last) < fourteenDays) return;
    swipeHint.classList.add('show');
    // Auto-hide after ~3.5s
    clearTimeout(maybeShowSwipeHint._t);
    maybeShowSwipeHint._t = setTimeout(() => hideSwipeHint(), 3500);
  }
  function hideSwipeHint() {
    if (!swipeHint) return;
    swipeHint.classList.remove('show');
    localStorage.setItem('swipe-hint-dismissed-at', String(Date.now()));
  }

  // Responsive social slider: compact mode when container is narrow
  const socialRow = document.getElementById('socialRow');
  const sliderDots = document.getElementById('sliderDots');
  function getCenteredIndex(row, slides) {
    const rowRect = row.getBoundingClientRect();
    const centerX = rowRect.left + rowRect.width / 2;
    let bestIdx = 0, bestDist = Infinity;
    slides.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const elCenter = r.left + r.width / 2;
      const d = Math.abs(elCenter - centerX);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    return bestIdx;
  }
  function updateCompactMode() {
    if (!socialRow) return;
    const rect = socialRow.getBoundingClientRect();
    const isCompact = rect.width < 520; // threshold for one-at-a-time
    socialRow.classList.toggle('is-compact', isCompact);
    // Center the middle slide (Discord) when entering compact
    if (isCompact) {
      const slides = socialRow.querySelectorAll('.social-circle');
      const middle = slides[1];
      middle?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
      buildDots(slides.length);
      updateDots(1);
      maybeShowSwipeHint();
      startAutoplay();
    } else {
      if (sliderDots) sliderDots.innerHTML = '';
      hideSwipeHint();
      stopAutoplay();
    }
  }
  window.addEventListener('resize', () => {
    updateCompactMode();
    // Re-center after layout settles
    setTimeout(updateCompactMode, 50);
  });
  window.addEventListener('load', updateCompactMode);
  // Initialize immediately as well (in case load is delayed)
  updateCompactMode();
  // Handle device rotation
  window.addEventListener('orientationchange', () => setTimeout(updateCompactMode, 100));

  // Keyboard navigation for compact slider
  function slideBy(delta) {
    if (!socialRow || !socialRow.classList.contains('is-compact')) return;
    const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
    if (!slides.length) return;
    // Find the slide closest to center
    const bestIdx = getCenteredIndex(socialRow, slides);
    let targetIdx = Math.max(0, Math.min(slides.length - 1, bestIdx + delta));
    slides[targetIdx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
  socialRow?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); slideBy(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); slideBy(1); }
    pauseThenResumeAutoplay();
  });

  // Touch gestures: limit to one-slide per swipe
  let touchStartX = null;
  let touchStartIdx = null;
  socialRow?.addEventListener('touchstart', (e) => {
    if (!socialRow.classList.contains('is-compact')) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
    touchStartIdx = getCenteredIndex(socialRow, slides);
    pauseThenResumeAutoplay();
  }, { passive: true });
  socialRow?.addEventListener('touchend', (e) => {
    if (!socialRow.classList.contains('is-compact')) return;
    if (touchStartX == null || touchStartIdx == null) return;
    const changed = e.changedTouches && e.changedTouches[0];
    const endX = changed ? changed.clientX : touchStartX;
    const dx = endX - touchStartX;
    const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
    let targetIdx = touchStartIdx;
    const SWIPE_THRESHOLD = 10; // small threshold; direction decides
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      targetIdx = touchStartIdx + (dx < 0 ? 1 : -1);
      targetIdx = Math.max(0, Math.min(slides.length - 1, targetIdx));
    }
    slides[targetIdx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    updateDots(targetIdx);
    touchStartX = null; touchStartIdx = null;
    hideSwipeHint();
    pauseThenResumeAutoplay();
  }, { passive: true });

  // Build and update dots
  function buildDots(count) {
    if (!sliderDots) return;
    sliderDots.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'dot' + (i === 1 ? ' active' : '');
      d.setAttribute('aria-label', 'Go to item ' + (i + 1));
      d.addEventListener('click', () => {
        const slides = socialRow.querySelectorAll('.social-circle');
        slides[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        updateDots(i);
        pauseThenResumeAutoplay();
      });
      sliderDots.appendChild(d);
    }
  }
  function updateDots(activeIdx) {
    if (!sliderDots) return;
    const dots = Array.from(sliderDots.querySelectorAll('.dot'));
    dots.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  }

  // Update active dot on scroll
  let scrollRaf = null;
  socialRow?.addEventListener('scroll', () => {
    if (!socialRow.classList.contains('is-compact')) return;
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
      const idx = getCenteredIndex(socialRow, slides);
      updateDots(idx);
    });
  }, { passive: true });

  // Autoplay for compact slider
  let autoplayTimer = null;
  let resumeAutoplayTimer = null;
  const AUTOPLAY_DELAY = 2000; // faster autoplay
  const RESUME_DELAY = 6000;
  const reduceMotionAutoplay = window.matchMedia('(prefers-reduced-motion: reduce)');

  function startAutoplay() {
    if (!socialRow || !socialRow.classList.contains('is-compact')) return;
    if (document.hidden) return;
    if (reduceMotionAutoplay.matches) return;
    stopAutoplay();
    autoplayTimer = setInterval(() => {
      // Advance by one
      slideBy(1);
    }, AUTOPLAY_DELAY);
  }
  function stopAutoplay() {
    if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
  }
  function pauseThenResumeAutoplay() {
    stopAutoplay();
    if (resumeAutoplayTimer) clearTimeout(resumeAutoplayTimer);
    resumeAutoplayTimer = setTimeout(() => startAutoplay(), RESUME_DELAY);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  });

  // Pause on pointer over (desktop), resume later
  socialRow?.addEventListener('mouseenter', pauseThenResumeAutoplay, { passive: true });
  socialRow?.addEventListener('mouseleave', () => startAutoplay(), { passive: true });

  // Cursor-follow glow
  const glow = document.getElementById('cursor-glow');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (glow && !reduceMotion.matches && !isTouch) {
    let x = 0, y = 0, tx = 0, ty = 0, rafId = null, idleTimer = null;
    const lerp = (a, b, t) => a + (b - a) * t;

    function loop() {
      tx = lerp(tx, x, 0.18);
      ty = lerp(ty, y, 0.18);
      glow.style.transform = `translate(${tx}px, ${ty}px)`;
      rafId = requestAnimationFrame(loop);
    }

    function onMove(e) {
      x = e.clientX; y = e.clientY;
      glow.style.opacity = '1';
      if (!rafId) rafId = requestAnimationFrame(loop);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { glow.style.opacity = '0'; }, 1200);
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', () => { glow.style.opacity = '0'; }, { passive: true });
  }
})();
