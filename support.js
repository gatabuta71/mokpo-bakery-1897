/*
 * support.js — index.html.html 템플릿을 일반 브라우저에서 그려 주는 작은 런타임
 *
 * 지원 문법
 *   {{a.b}}                      텍스트 · 속성 값 바인딩
 *   onClick="{{fn}}"             이벤트 연결 (on으로 시작하는 속성)
 *   <sc-for list="{{xs}}" as="x"> 반복
 *   <sc-if value="{{cond}}">     조건부 표시
 *   <script type="text/x-dc" data-dc-script>  class Component extends DCLogic { renderVals() {...} }
 */
(function () {
  'use strict';

  var HAS = /\{\{/;
  var ALL = /\{\{([^}]+)\}\}/g;
  var scheduled = false;
  var rerender = function () {};

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch) {
    this.state = Object.assign({}, this.state, patch);
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(function () { scheduled = false; rerender(); });
  };
  DCLogic.prototype.renderVals = function () { return {}; };
  window.DCLogic = DCLogic;

  function lookup(scope, expr) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    return expr.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, scope);
  }
  function exprOf(attr) {
    var m = /^\s*\{\{([^}]+)\}\}\s*$/.exec(attr || '');
    return m ? m[1] : attr;
  }
  function interp(text, scope) {
    return text.replace(ALL, function (_, e) {
      var v = lookup(scope, e);
      return v == null ? '' : String(v);
    });
  }

  // 템플릿 안 이미지가 {{...}} 주소를 먼저 불러오지 않도록 src를 잠시 숨김
  function stashSrc(node) {
    if (node.nodeType !== 1) return;
    if (node.hasAttribute('src') && HAS.test(node.getAttribute('src'))) {
      node.setAttribute('data-dc-src', node.getAttribute('src'));
      node.removeAttribute('src');
    }
    Array.prototype.forEach.call(node.children, stashSrc);
  }

  function cloneChildren(tpl) {
    var frag = document.createDocumentFragment();
    Array.prototype.forEach.call(tpl.childNodes, function (c) { frag.appendChild(c.cloneNode(true)); });
    return frag;
  }

  function bindBlock(el, ups) {
    var anchor = document.createComment(el.tagName.toLowerCase());
    el.parentNode.replaceChild(anchor, el);
    stashSrc(el);
    var isFor = el.tagName.toLowerCase() === 'sc-for';
    var expr = exprOf(el.getAttribute(isFor ? 'list' : 'value'));
    var as = el.getAttribute('as') || 'item';
    var live = [];      // 현재 그려진 노드
    var inner = [];     // sc-if 안쪽 바인딩 (다시 그리지 않고 갱신)

    function clear() {
      live.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      live = [];
    }
    function mount(scope, out) {
      var frag = cloneChildren(el);
      var nodes = Array.prototype.slice.call(frag.childNodes);
      nodes.forEach(function (n) { bind(n, out); });
      out.forEach(function (u) { u(scope); });
      anchor.parentNode.insertBefore(frag, anchor);
      live = live.concat(nodes);
    }

    ups.push(function (scope) {
      var v = lookup(scope, expr);
      if (isFor) {
        clear();
        (v || []).forEach(function (item, i) {
          var child = Object.create(scope);
          child[as] = item;
          child.$index = i;
          mount(child, []);
        });
      } else if (v) {
        if (live.length) inner.forEach(function (u) { u(scope); });   // 폼 입력값 유지
        else { inner = []; mount(scope, inner); }
      } else {
        clear();
        inner = [];
      }
    });
  }

  function bind(node, ups) {
    if (node.nodeType === 3) {
      if (HAS.test(node.data)) {
        var t = node.data;
        ups.push(function (s) { node.data = interp(t, s); });
      }
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for' || tag === 'sc-if') { bindBlock(node, ups); return; }
    if (tag === 'script' || tag === 'style') return;

    Array.prototype.slice.call(node.attributes).forEach(function (a) {
      if (!HAS.test(a.value)) return;
      var name = a.name, tpl = a.value;
      if (/^on/i.test(name)) {
        node.removeAttribute(name);
        var evt = name.slice(2).toLowerCase(), fn = null;
        node.addEventListener(evt, function (e) { if (typeof fn === 'function') fn(e); });
        ups.push(function (s) { fn = lookup(s, exprOf(tpl)); });
        return;
      }
      var target = name === 'data-dc-src' ? 'src' : name;
      if (name === 'data-dc-src') node.removeAttribute(name);
      ups.push(function (s) { node.setAttribute(target, interp(tpl, s)); });
    });
    Array.prototype.slice.call(node.childNodes).forEach(function (c) { bind(c, ups); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector('x-dc');
    var src = document.querySelector('script[data-dc-script]');
    if (!root || !src) return;
    var Component = new Function('DCLogic', src.textContent + '\n;return Component;')(DCLogic);
    var props = {};
    try { props = JSON.parse(src.getAttribute('data-props') || '{}'); } catch (e) {}
    var inst = new Component(props);
    var ups = [];
    Array.prototype.slice.call(root.childNodes).forEach(function (n) { bind(n, ups); });
    rerender = function () {
      var vals = inst.renderVals();
      ups.forEach(function (u) { u(vals); });
    };
    rerender();
  });
})();
