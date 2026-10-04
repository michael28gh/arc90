(function () {
  'use strict';
  var key = 'arc90.analytics-consent.v1';
  var choice = null;
  var loaded = false;
  var eligible = location.protocol === 'https:' && location.hostname === 'arc90.vercel.app' &&
    !(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.getPlatform && window.Capacitor.getPlatform() !== 'web'));
  try { choice = localStorage.getItem(key); } catch (_) { /* Default to no analytics. */ }
  if (choice !== 'accepted' && choice !== 'declined') choice = null;

  function enable() {
    if (!eligible || choice !== 'accepted' || loaded) return;
    loaded = true;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    // Page views only: reject app events and strip checkout/query data before transmission.
    window.va('beforeSend', function (event) {
      if (choice !== 'accepted' || event.type !== 'pageview') return null;
      var url = new URL(event.url, location.origin);
      url.search = '';
      url.hash = '';
      return Object.assign({}, event, { url: url.href });
    });
    var script = document.createElement('script');
    script.defer = true;
    script.src = '/_vercel/insights/script.js';
    document.head.appendChild(script);
  }

  function mount() {
    if (!eligible) return;
    var inApp = !!document.getElementById('app');
    var returnFocus = null;
    var panel = document.createElement('section');
    panel.id = 'privacy-consent';
    panel.className = 'privacy-consent';
    panel.setAttribute('aria-label', 'Analytics preference');
    panel.innerHTML = '<h2>Optional analytics</h2><p>Allow Vercel page-view analytics to help improve Arc90? Analytics stays off until you allow it. Your habits and health entries are not included. Essential device storage keeps the app working. <a href="/privacy">Privacy policy</a></p><div class="privacy-actions"><button type="button" data-choice="declined">Decline analytics</button><button type="button" data-choice="accepted">Allow analytics</button></div><p class="privacy-storage" role="status"></p>';
    var settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'privacy-settings';
    settings.textContent = 'Privacy choices';
    settings.setAttribute('aria-controls', panel.id);
    function show(open) {
      panel.hidden = !open;
      settings.setAttribute('aria-expanded', String(open));
      document.querySelectorAll('[data-privacy-open]').forEach(function (button) {
        button.setAttribute('aria-expanded', String(open));
      });
    }
    settings.addEventListener('click', function () {
      show(panel.hidden);
      if (!panel.hidden) panel.querySelector('button').focus();
    });
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-privacy-open]');
      if (!trigger) return;
      returnFocus = trigger;
      show(true);
      panel.querySelector('button').focus();
    });
    panel.addEventListener('click', function (event) {
      var selected = event.target.getAttribute('data-choice');
      if (!selected) return;
      choice = selected;
      var saved = true;
      try { localStorage.setItem(key, choice); } catch (_) { saved = false; }
      enable();
      if (saved) {
        show(false);
        var target = inApp ? (returnFocus && returnFocus.isConnected ? returnFocus : document.querySelector('[data-privacy-open]')) : settings;
        if (target) target.focus();
      }
      else panel.querySelector('.privacy-storage').textContent = 'Choice applied for this page only. Your browser could not save it.';
    });
    window.addEventListener('storage', function (event) {
      if (event.key !== key && event.key !== null) return;
      choice = event.newValue === 'accepted' ? 'accepted' : event.newValue === 'declined' ? 'declined' : null;
      show(!choice);
      enable();
    });
    document.body.appendChild(panel);
    if (!inApp) document.body.appendChild(settings);
    show(!choice);
    enable();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
