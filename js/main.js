/* ============================================================
   Faizaan Lone — Portfolio Main JS
   Apple-Inspired · Photography-First · 2025
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ----------------------------------------------------------
     Utility: detect touch device
  ---------------------------------------------------------- */
  const isTouchDevice = () =>
    'ontouchstart' in window || navigator.maxTouchPoints > 0;

  /* ==========================================================
     1. SCROLL REVEAL SYSTEM
  ========================================================== */
  const revealElements = document.querySelectorAll('.reveal');

  if (revealElements.length) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    revealElements.forEach((el) => revealObserver.observe(el));
  }

  /* ==========================================================
     2. NAVIGATION BEHAVIOR
  ========================================================== */
  const navbar = document.querySelector('#globalNav');
  const navLinks = document.querySelectorAll('.nav-links a');
  const navHamburger = document.querySelector('#navHamburger');
  const mobileOverlay = document.querySelector('#mobileOverlay');
  const sections = document.querySelectorAll('section');

  let lastScrollY = window.scrollY;
  let ticking = false;

  /* --- 2a. Hide / Show on scroll ----------------------------- */
  const handleNavScroll = () => {
    const currentScrollY = window.scrollY;

    if (navbar) {
      // Hide on scroll-down, show on scroll-up
      if (currentScrollY > 100 && currentScrollY > lastScrollY) {
        navbar.classList.add('hidden');
      } else {
        navbar.classList.remove('hidden');
      }
    }

    lastScrollY = currentScrollY;
    ticking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        requestAnimationFrame(handleNavScroll);
        ticking = true;
      }
    },
    { passive: true }
  );

  /* --- 2b. Active section highlighting ----------------------- */
  if (sections.length && navLinks.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            navLinks.forEach((link) => {
              link.classList.toggle(
                'active',
                link.getAttribute('href').includes(id)
              );
            });
          }
        });
      },
      { threshold: 0.3, rootMargin: '-44px 0px 0px 0px' }
    );

    sections.forEach((section) => sectionObserver.observe(section));
  }

  /* --- 2c. Mobile menu toggle -------------------------------- */
  const closeMobileMenu = () => {
    if (navHamburger) navHamburger.classList.remove('active');
    if (mobileOverlay) mobileOverlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (navHamburger) {
    navHamburger.addEventListener('click', () => {
      navHamburger.classList.toggle('active');
      if (mobileOverlay) mobileOverlay.classList.toggle('active');
      document.body.style.overflow = mobileOverlay?.classList.contains('active')
        ? 'hidden'
        : '';
    });
  }

  if (mobileOverlay) {
    mobileOverlay.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMobileMenu);
    });
  }

  /* ==========================================================
     3. ROLE TEXT CYCLING
  ========================================================== */
  const roleDynamic = document.querySelector('#roleDynamic');

  if (roleDynamic) {
    const roles = ['Developer', 'Designer', 'Creator', 'Learner'];
    let roleIndex = 0;

    const cycleRole = () => {
      // Fade out
      roleDynamic.style.opacity = '0';
      roleDynamic.style.transform = 'translateY(-8px)';

      setTimeout(() => {
        roleIndex = (roleIndex + 1) % roles.length;
        roleDynamic.textContent = roles[roleIndex];

        // Fade in
        roleDynamic.style.opacity = '1';
        roleDynamic.style.transform = 'translateY(0)';
      }, 300);
    };

    // Ensure transitions
    roleDynamic.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    roleDynamic.style.display = 'inline-block';

    setInterval(cycleRole, 2500);
  }

  /* ==========================================================
     4. STAT COUNTER ANIMATION
  ========================================================== */
  const statNumbers = document.querySelectorAll('.stat-number[data-target]');

  if (statNumbers.length) {
    const animateCounter = (el) => {
      const target = parseInt(el.dataset.target, 10);
      if (isNaN(target)) return;

      const duration = 1500;
      const startTime = performance.now();

      const step = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out quad
        const eased = 1 - (1 - progress) * (1 - progress);
        el.textContent = Math.round(eased * target);

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = target;
        }
      };

      requestAnimationFrame(step);
    };

    const statObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    statNumbers.forEach((el) => statObserver.observe(el));
  }

  /* ==========================================================
     5. SMOOTH SCROLL (anchor links)
  ========================================================== */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const targetEl = document.querySelector(targetId);
      if (!targetEl) return;

      e.preventDefault();

      const offset = 44; // global nav height
      const top =
        targetEl.getBoundingClientRect().top + window.scrollY - offset;

      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ==========================================================
     6. PROJECT GALLERY
  ========================================================== */
  const galleryMainImg = document.querySelector('#galleryMainImg');
  const galleryThumbs = document.querySelectorAll('.gallery-thumbs img');

  if (galleryMainImg && galleryThumbs.length) {
    galleryThumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const fullSrc = thumb.getAttribute('data-full');
        if (!fullSrc) return;

        galleryMainImg.src = fullSrc;

        // Toggle active class
        galleryThumbs.forEach((t) => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }
});
