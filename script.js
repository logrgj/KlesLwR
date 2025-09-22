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
  const pagerBar = document.getElementById('pagerBar');
  // Match reduced motion early so it's available before autoplay starts
  const reduceMotionAutoplay = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Autoplay controls declared early to avoid TDZ when functions run on load
  let autoplayTimer = null;
  let resumeAutoplayTimer = null;
  const AUTOPLAY_DELAY = 3000; // 3s per step
  const RESUME_DELAY = 6000;
  // No arrows: only using touch/keyboard/dots
  function getCenteredIndex(row, slides) {
    // Compute based on container scroll and slide offsets for reliable results
    const containerCenter = row.scrollLeft + row.clientWidth / 2;
    let bestIdx = 0, bestDist = Infinity;
    slides.forEach((el, i) => {
      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      const d = Math.abs(elCenter - containerCenter);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    return bestIdx;
  }
  let currentIdx = 1; // committed centered index
  let baselineIdx = null; // baseline index when a scroll gesture starts
  let gestureLocked = false; // used for wheel only
  let wheelAccumX = 0; // accumulate wheel deltaX per gesture

  function updateCompactMode() {
    if (!socialRow) return;
    const rect = socialRow.getBoundingClientRect();
    const mqCompact = window.matchMedia('(max-width: 700px)').matches;
    const isCompactByWidth = rect.width < 520; // threshold for one-at-a-time
    const isCompact = mqCompact || isCompactByWidth;
    socialRow.classList.toggle('is-compact', isCompact);
    // Center the middle slide (Discord) when entering compact
    if (isCompact) {
      const slides = socialRow.querySelectorAll('.social-circle');
      const middle = slides[1];
      middle?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
      // Hide dots UI; we only use the pager indicator
      if (sliderDots) sliderDots.style.display = 'none';
      // Initialize pager: 3 items (left, middle, right)
      if (pagerBar) {
        pagerBar.style.setProperty('--count', String(slides.length));
        pagerBar.style.setProperty('--index', '1');
      }
      currentIdx = 1;
      maybeShowSwipeHint();
      startAutoplay();
    } else {
      if (sliderDots) sliderDots.innerHTML = '';
      hideSwipeHint();
      stopAutoplay();
      // Still ensure pager is configured when not compact
      const slides = socialRow.querySelectorAll('.social-circle');
      if (pagerBar) {
        pagerBar.style.setProperty('--count', String(slides.length || 3));
        // Default to middle
        pagerBar.style.setProperty('--index', '1');
      }
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
  // Also set up pager immediately based on current slides
  if (socialRow && pagerBar) {
    const slides = socialRow.querySelectorAll('.social-circle');
    pagerBar.style.setProperty('--count', String(slides.length || 3));
    pagerBar.style.setProperty('--index', '1');
  }
  // Handle device rotation
  window.addEventListener('orientationchange', () => setTimeout(updateCompactMode, 100));

  // Keyboard navigation for compact slider
  function slideBy(delta) {
    if (!socialRow) return;
    const isOverflowing = socialRow.scrollWidth > socialRow.clientWidth + 2;
    const isCompact = socialRow.classList.contains('is-compact') || window.matchMedia('(max-width: 700px)').matches;
    if (!isCompact && !isOverflowing) return;
    const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
    if (!slides.length) return;
    // Find the slide closest to center
    const bestIdx = getCenteredIndex(socialRow, slides);
    let targetIdx = Math.max(0, Math.min(slides.length - 1, bestIdx + delta));
    slides[targetIdx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    // Update pager indicator
    if (pagerBar) pagerBar.style.setProperty('--index', String(targetIdx));
    currentIdx = targetIdx;
  }
  socialRow?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); slideBy(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); slideBy(1); }
    pauseThenResumeAutoplay();
  });

  // Arrow logic removed

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
    if (pagerBar) pagerBar.style.setProperty('--index', String(targetIdx));
    touchStartX = null; touchStartIdx = null;
    hideSwipeHint();
    pauseThenResumeAutoplay();
  }, { passive: true });

  // Dots removed: use only pager indicator via pagerBar CSS vars

  // Update active dot on scroll and optimize during scroll
  let scrollRaf = null;
  let scrollIdleTimer = null;
  socialRow?.addEventListener('scroll', () => {
    // Update pager position as the centered item changes
    // Add a class to reduce transitions while actively scrolling
    socialRow.classList.add('is-scrolling');
    if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => socialRow.classList.remove('is-scrolling'), 200);
    // Set baseline index on first scroll frame of a gesture
    if (baselineIdx == null) {
      const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
      baselineIdx = getCenteredIndex(socialRow, slides);
      // Pause autoplay on user interaction, resume later
      pauseThenResumeAutoplay();
    }
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
      const idx = getCenteredIndex(socialRow, slides);
      if (pagerBar) pagerBar.style.setProperty('--index', String(idx));
    });
  }, { passive: true });

  // Also update on native scrollend when supported and enforce single-step
  function onScrollEndClamp() {
    socialRow.classList.remove('is-scrolling');
    const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
    // Determine base index and decide direction based on distance threshold (smooth, one-step)
    const base = baselineIdx != null ? baselineIdx : currentIdx;
    const baseEl = slides[base];
    let targetIdx = base;
    if (baseEl) {
      const containerCenter = socialRow.scrollLeft + socialRow.clientWidth / 2;
      const baseCenter = baseEl.offsetLeft + baseEl.offsetWidth / 2;
      const delta = containerCenter - baseCenter; // + means moved right
      const threshold = baseEl.offsetWidth * 0.33; // need ~33% move to advance (smoother)
      if (delta > threshold && base < slides.length - 1) targetIdx = base + 1;
      else if (delta < -threshold && base > 0) targetIdx = base - 1;
    }
    targetIdx = Math.max(0, Math.min(slides.length - 1, targetIdx));
    baselineIdx = null; // reset for next gesture
    // Snap to final target (may be same as idx)
    if (targetIdx !== currentIdx) {
      slides[targetIdx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    if (pagerBar) pagerBar.style.setProperty('--index', String(targetIdx));
    currentIdx = targetIdx;
    // no lock needed for touch/drag; wheel uses its own logic
  }
  socialRow?.addEventListener('scrollend', onScrollEndClamp, { passive: true });

  // Update dots during touchmove swipes as well
  socialRow?.addEventListener('touchmove', (e) => {
    const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
    const idx = getCenteredIndex(socialRow, slides);
    if (pagerBar) pagerBar.style.setProperty('--index', String(idx));
  }, { passive: false });

  // Establish baseline on touchstart and clamp on touchend
  socialRow?.addEventListener('touchstart', () => {
    if (!socialRow.classList.contains('is-compact')) return;
    const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
    baselineIdx = getCenteredIndex(socialRow, slides);
    gestureLocked = false;
    pauseThenResumeAutoplay();
  }, { passive: true });
  socialRow?.addEventListener('touchend', onScrollEndClamp, { passive: true });

  // Wheel: allow only one step per wheel gesture
  socialRow?.addEventListener('wheel', (e) => {
    if (!socialRow.classList.contains('is-compact')) return;
    const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
    if (!slides.length) return;
    // Non-passive to allow preventDefault
    // If already locked, block native scroll
    if (gestureLocked) { e.preventDefault(); return; }
    wheelAccumX += e.deltaX;
    const THRESH = 30; // sensitivity
    if (Math.abs(wheelAccumX) > THRESH) {
      const dir = wheelAccumX > 0 ? 1 : -1;
      slideBy(dir);
      gestureLocked = true;
      e.preventDefault();
      wheelAccumX = 0;
      setTimeout(() => { gestureLocked = false; }, 220);
      pauseThenResumeAutoplay();
    }
  }, { passive: false });

  // Autoplay (all sizes)

  function startAutoplay() {
    if (!socialRow) return;
    if (document.hidden) return;
    if (reduceMotionAutoplay.matches) return;
    stopAutoplay();
    autoplayTimer = setInterval(() => {
      const slides = Array.from(socialRow.querySelectorAll('.social-circle'));
      if (!slides.length) return;
      const idx = getCenteredIndex(socialRow, slides);
      const next = (idx + 1) % slides.length;
      slides[next].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      if (pagerBar) pagerBar.style.setProperty('--index', String(next));
      currentIdx = next;
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

  // Desktop parallax on icon images inside social circles
  (function initParallaxIcons(){
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktopHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduce || !desktopHover) return;
    const circles = Array.from(document.querySelectorAll('#socialRow .social-circle'));
    circles.forEach((circle) => {
      const icon = circle.querySelector('.item-icon');
      if (!icon) return;
      let raf = null, targetX = 0, targetY = 0, cx = 0, cy = 0;
      const maxShift = 6; // px
      function loop(){
        // simple easing towards target
        cx += (targetX - cx) * 0.12;
        cy += (targetY - cy) * 0.12;
        icon.style.transform = `translate(${cx}px, ${cy}px)`;
        raf = requestAnimationFrame(loop);
      }
      function onMove(e){
        const rect = circle.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const nx = (x / rect.width) * 2 - 1; // -1..1
        const ny = (y / rect.height) * 2 - 1;
        targetX = -nx * maxShift;
        targetY = -ny * maxShift;
        if (!raf) raf = requestAnimationFrame(loop);
      }
      function onLeave(){
        targetX = 0; targetY = 0;
        if (!raf) raf = requestAnimationFrame(loop);
        // stop after settling
        setTimeout(() => { cancelAnimationFrame(raf); raf = null; }, 220);
      }
      circle.addEventListener('mousemove', onMove, { passive: true });
      circle.addEventListener('mouseleave', onLeave, { passive: true });
    });
  })();

  // Brand logo: Robo face animation sequence
  (function initRoboOverlay(){
    const brandBtn = document.getElementById('brandButton');
    const overlay = document.getElementById('roboOverlay');
    if (!brandBtn || !overlay) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isOverlayOpen = false;
    let keyHandlerBound = false;

    function animateRobo() {
      if (isOverlayOpen) return;
      isOverlayOpen = true;
      // Pause autoplay while we run the sequence
      pauseThenResumeAutoplay();
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      // Bind temporary close handlers (delay a tick to avoid closing from the same click)
      setTimeout(() => {
        overlay.addEventListener('click', onClose, { once: true });
        if (!keyHandlerBound) {
          document.addEventListener('keydown', onKey);
          keyHandlerBound = true;
        }
      }, 0);
      // Query SVG parts
      const svg = overlay.querySelector('.robo-svg');
      const leftPupil = svg?.querySelector('.eye-left .pupil');
      const rightPupil = svg?.querySelector('.eye-right .pupil');
      const mouth = svg?.querySelector('.mouth');
      if (reduce) {
        // Minimal: brief show then hide
        setTimeout(() => closeOverlay(), 1200);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      // Helper to move pupils
      function movePupils(dx) {
        if (leftPupil) leftPupil.setAttribute('cx', String(70 + dx));
        if (rightPupil) rightPupil.setAttribute('cx', String(130 + dx));
      }
      // Helper to set mouth (smile vs neutral)
      function setSmile(smile) {
        if (!mouth) return;
        if (smile) {
          // Bigger smile arc
          mouth.setAttribute('d', 'M65 130 Q100 150 135 130');
        } else {
          // Neutral line
          mouth.setAttribute('d', 'M70 130 Q100 130 130 130');
        }
      }
      // Sequence: look right -> look left -> center + smile -> hold -> hide
      movePupils(8);
      setTimeout(() => movePupils(-8), 380);
      setTimeout(() => { movePupils(0); setSmile(true); }, 760);
      setTimeout(() => { setSmile(false); closeOverlay(); }, 1500);
      // Scroll to top after hide begins
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 1520);
    }

    function closeOverlay(){
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      isOverlayOpen = false;
      if (keyHandlerBound) {
        document.removeEventListener('keydown', onKey);
        keyHandlerBound = false;
      }
    }
    function onClose(){ closeOverlay(); }
    function onKey(e){ if (e.key === 'Escape') closeOverlay(); }

    function onActivate(e){
      if (e && e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e?.preventDefault?.();
      // Small visual feedback on the brand to show the click was received
      brandBtn.classList.add('pressed');
      setTimeout(() => brandBtn.classList.remove('pressed'), 180);
      animateRobo();
    }

    brandBtn.addEventListener('click', onActivate);
    brandBtn.addEventListener('keydown', onActivate);
    // Fallback delegation in case the event target is an inner element
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest && t.closest('#brandButton')) onActivate(e);
    });
  })();

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

  // Theme toggle: maintain aria-pressed for accessibility (moved here)
  (function initThemeToggleA11y(){
    const toggleEl = document.getElementById('themeToggle');
    if (!toggleEl) return;
    function sync(){
      const pressed = document.body.classList.contains('light');
      toggleEl.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    }
    sync();
    toggleEl.addEventListener('click', () => {
      // Click handler already toggles theme earlier; defer sync slightly
      setTimeout(sync, 0);
    });
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  })();

  // (removed) Robot mascot in-hero logic
})();
