/* Click-to-enlarge for documentation screenshots.
 *
 * Screenshots on these pages are dense — link editors, full maps, per-member
 * labels — and at body-text width the detail that matters is unreadable. This
 * opens any content image in an overlay at full scale, with a second click
 * zooming to 1:1 pixels and dragging to pan.
 *
 * Reading flow is the constraint: the overlay never navigates, the page keeps
 * its exact scroll position, Escape / backdrop / close button all dismiss it,
 * and focus returns to the image that was opened. Implemented locally rather
 * than via a plugin so the docs build stays `pip install mkdocs-material`.
 */
(function () {
  'use strict';

  var overlay = null;
  var img = null;
  var caption = null;
  var opener = null;
  var zoomed = false;
  var drag = null;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'nwm-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Enlarged image');
    overlay.innerHTML =
      '<button class="nwm-lightbox__close" type="button" aria-label="Close image (Escape)">&times;</button>' +
      '<figure class="nwm-lightbox__figure">' +
      '<img class="nwm-lightbox__img" alt="">' +
      '<figcaption class="nwm-lightbox__caption"></figcaption>' +
      '</figure>';
    img = overlay.querySelector('.nwm-lightbox__img');
    caption = overlay.querySelector('.nwm-lightbox__caption');

    overlay.addEventListener('click', function (e) {
      // Clicking the backdrop (not the image itself) closes.
      if (e.target === overlay || e.target.classList.contains('nwm-lightbox__figure')) {
        close();
      }
    });
    overlay.querySelector('.nwm-lightbox__close').addEventListener('click', close);
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleZoom(e);
    });

    // Drag to pan while zoomed.
    img.addEventListener('pointerdown', function (e) {
      if (!zoomed) {
        return;
      }
      drag = { x: e.clientX, y: e.clientY, left: overlay.scrollLeft, top: overlay.scrollTop };
      img.setPointerCapture(e.pointerId);
      img.classList.add('is-grabbing');
    });
    img.addEventListener('pointermove', function (e) {
      if (!drag) {
        return;
      }
      overlay.scrollLeft = drag.left - (e.clientX - drag.x);
      overlay.scrollTop = drag.top - (e.clientY - drag.y);
    });
    ['pointerup', 'pointercancel'].forEach(function (t) {
      img.addEventListener(t, function () {
        drag = null;
        img.classList.remove('is-grabbing');
      });
    });

    document.body.appendChild(overlay);
  }

  function toggleZoom(e) {
    zoomed = !zoomed;
    overlay.classList.toggle('is-zoomed', zoomed);
    if (zoomed && e) {
      // Keep the clicked point roughly under the cursor after zooming.
      var r = img.getBoundingClientRect();
      var fx = (e.clientX - r.left) / r.width;
      var fy = (e.clientY - r.top) / r.height;
      requestAnimationFrame(function () {
        overlay.scrollLeft = fx * img.offsetWidth - overlay.clientWidth / 2;
        overlay.scrollTop = fy * img.offsetHeight - overlay.clientHeight / 2;
      });
    }
  }

  function open(source) {
    if (!overlay) {
      build();
    }
    opener = source;
    zoomed = false;
    overlay.classList.remove('is-zoomed');
    img.src = source.currentSrc || source.src;
    img.alt = source.alt || '';
    var text = source.alt || '';
    caption.textContent = text;
    caption.style.display = text ? '' : 'none';
    // Lock the page WITHOUT losing scroll position, so dismissing the overlay
    // puts the reader back exactly where they were.
    var y = window.scrollY;
    document.body.dataset.nwmScroll = String(y);
    document.body.classList.add('nwm-lightbox-open');
    document.body.style.top = '-' + y + 'px';
    overlay.classList.add('is-open');
    overlay.querySelector('.nwm-lightbox__close').focus();
  }

  function close() {
    if (!overlay || !overlay.classList.contains('is-open')) {
      return;
    }
    overlay.classList.remove('is-open', 'is-zoomed');
    zoomed = false;
    var y = parseInt(document.body.dataset.nwmScroll || '0', 10);
    document.body.classList.remove('nwm-lightbox-open');
    document.body.style.top = '';
    window.scrollTo(0, y);
    if (opener && typeof opener.focus === 'function') {
      // preventScroll matters: focus() otherwise scrolls the element into
      // view and overrides the restore above. On a long page (the icon
      // reference is ~15,000px) that silently dropped the reader hundreds of
      // pixels from where they were — the exact thing this overlay exists to
      // avoid. Older browsers ignore the option and simply focus.
      try {
        opener.focus({ preventScroll: true });
      } catch (e) {
        opener.focus();
      }
    }
    opener = null;
  }

  // Delegated so it covers every page and survives re-rendered content.
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!(target instanceof HTMLImageElement)) {
      return;
    }
    if (!target.closest('.md-content')) {
      return;
    }
    // Leave genuine links (badges, logos wrapped in <a>) alone.
    if (target.closest('a')) {
      return;
    }
    e.preventDefault();
    open(target);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      close();
    }
  });

  // Make content images look and behave like controls.
  function markImages() {
    document.querySelectorAll('.md-content img').forEach(function (el) {
      if (el.closest('a') || el.dataset.nwmZoomable) {
        return;
      }
      el.dataset.nwmZoomable = '1';
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('title', 'Click to enlarge');
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(el);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markImages);
  } else {
    markImages();
  }
  // Material's instant navigation swaps content without a reload.
  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(markImages);
  }
})();
