/*
  image-protect.js
  Deters casual image saving (right-click, drag, long-press on mobile,
  view-source, print/save shortcuts). This CANNOT block screenshots or
  screen recordings — those happen at the OS level and no website can
  see or stop them. This only removes the easy, casual saving methods.
*/
(function () {
  function lockImages(root) {
    (root || document).querySelectorAll('img').forEach(function (img) {
      img.setAttribute('draggable', 'false');
      img.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      img.addEventListener('dragstart', function (e) { e.preventDefault(); });
    });
  }

  // Lock any images already on the page
  document.addEventListener('DOMContentLoaded', function () { lockImages(document); });

  // Re-lock images that get added later (galleries/lightbox loaded via JS)
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IMG') lockImages(node.parentNode);
        else if (node.querySelectorAll) lockImages(node);
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Belt-and-braces: catch right-clicks on any image even if listener missed it
  document.addEventListener('contextmenu', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.preventDefault();
  });

  // Block common save/print/view-source/devtools shortcuts
  document.addEventListener('keydown', function (e) {
    var k = e.key ? e.key.toLowerCase() : '';
    var ctrlOrCmd = e.ctrlKey || e.metaKey;

    if (ctrlOrCmd && (k === 's' || k === 'p' || k === 'u')) {
      e.preventDefault();
    }
    if (e.key === 'F12') {
      e.preventDefault();
    }
    if (ctrlOrCmd && e.shiftKey && (k === 'i' || k === 'c' || k === 'j')) {
      e.preventDefault();
    }
  });
})();
