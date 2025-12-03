/*!
 * mishkah-alpine.js — Alpine.js-like (Direct DOM) Layer for Mishkah
 * Provides: start
 * 2025-12-03
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah', 'mishkah-svelte'], function (M, S) { return factory(root, M, S); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'), require('mishkah-svelte'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.Alpine = factory(root, root.Mishkah, root.Mishkah.Svelte);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M, S) {
    "use strict";

    if (!S || !S.state) {
        console.error('Mishkah.Alpine requires Mishkah.Svelte (mishkah-svelte.js) for reactivity.');
        return {};
    }

    // -------------------------------------------------------------------
    // Alpine-like Direct DOM Engine
    // -------------------------------------------------------------------

    function start() {
        // 1. Find all roots (x-data)
        var roots = document.querySelectorAll('[x-data]');

        roots.forEach(function (rootEl) {
            if (rootEl.__mishkah_alpine_inited) return;
            rootEl.__mishkah_alpine_inited = true;

            // 2. Initialize State
            var dataExpr = rootEl.getAttribute('x-data');
            var initialState = {};
            try {
                // Evaluate x-data="{ count: 0 }"
                // We use a Function to eval in a safe-ish scope
                initialState = new Function('return ' + dataExpr)();
            } catch (e) {
                console.error('Mishkah Alpine: Error evaluating x-data', e);
            }

            // Create Reactive Proxy (using Svelte's state)
            // Note: Svelte's state() uses React hooks under the hood.
            // BUT here we are NOT in a React component! We are in global scope.
            // S.state() expects to be called inside a component (R.useState).
            // This is a problem. Our Svelte layer is VDOM-bound.

            // We need a standalone reactivity system for Alpine.
            // Or we can "fake" a component environment?
            // No, let's build a simple standalone reactivity here using the same principles.

            var state = createStandaloneState(initialState);

            // 3. Bind Directives
            walk(rootEl, state);
        });
    }

    // Standalone Reactivity (Deep Proxy + Subscribers)
    function createStandaloneState(initial) {
        var listeners = new Set();

        function notify() {
            listeners.forEach(function (fn) { fn(); });
        }

        function createProxy(target) {
            if (typeof target !== 'object' || target === null) return target;
            return new Proxy(target, {
                get: function (obj, prop) {
                    return createProxy(obj[prop]);
                },
                set: function (obj, prop, value) {
                    obj[prop] = value;
                    notify();
                    return true;
                }
            });
        }

        var proxy = createProxy(initial);
        proxy.$subscribe = function (fn) { listeners.add(fn); };
        return proxy;
    }

    function walk(el, state) {
        // Process attributes

        // x-text
        if (el.hasAttribute('x-text')) {
            var expr = el.getAttribute('x-text');
            bindEffect(el, state, function () {
                el.textContent = evaluate(expr, state);
            });
        }

        // x-html
        if (el.hasAttribute('x-html')) {
            var expr = el.getAttribute('x-html');
            bindEffect(el, state, function () {
                el.innerHTML = evaluate(expr, state);
            });
        }

        // x-show
        if (el.hasAttribute('x-show')) {
            var expr = el.getAttribute('x-show');
            bindEffect(el, state, function () {
                el.style.display = evaluate(expr, state) ? '' : 'none';
            });
        }

        // x-on:click or @click
        Array.from(el.attributes).forEach(function (attr) {
            var name = attr.name;
            var eventName = null;

            if (name.startsWith('x-on:')) eventName = name.replace('x-on:', '');
            if (name.startsWith('@')) eventName = name.replace('@', '');

            if (eventName) {
                var expr = attr.value;
                el.addEventListener(eventName, function (e) {
                    // Execute expression with $event
                    evaluate(expr, state, { $event: e });
                });
            }

            // x-bind:class or :class
            if (name.startsWith('x-bind:') || name.startsWith(':')) {
                var prop = name.startsWith(':') ? name.replace(':', '') : name.replace('x-bind:', '');
                var expr = attr.value;
                bindEffect(el, state, function () {
                    var val = evaluate(expr, state);
                    if (prop === 'class' && typeof val === 'object') {
                        // Object syntax: { active: true }
                        for (var cls in val) {
                            if (val[cls]) el.classList.add(cls);
                            else el.classList.remove(cls);
                        }
                    } else {
                        el.setAttribute(prop, val);
                    }
                });
            }

            // x-model (Two-way binding)
            if (name === 'x-model') {
                var prop = attr.value; // e.g. "count" or "user.name"
                // 1. Bind value -> input
                bindEffect(el, state, function () {
                    el.value = evaluate(prop, state);
                });
                // 2. Bind input -> value
                el.addEventListener('input', function (e) {
                    // We need to set the value.
                    // Simple assignment for top-level: state[prop] = ...
                    // For nested: user.name = ... (requires parsing)
                    // For now, simple top-level support
                    state[prop] = e.target.value;
                });
            }
        });

        // Recurse
        var child = el.firstElementChild;
        while (child) {
            // If child has x-data, it's a new scope (nested).
            // For now, we don't support nested scopes inheriting parent.
            if (!child.hasAttribute('x-data')) {
                walk(child, state);
            }
            child = child.nextElementSibling;
        }
    }

    function bindEffect(el, state, fn) {
        // Run immediately
        fn();
        // Subscribe to state changes
        // This is "coarse-grained" (updates on ANY state change).
        // Efficient enough for small Alpine widgets.
        state.$subscribe(fn);
    }

    function evaluate(expr, state, extra) {
        try {
            // Create a function with `this` as state and variables from state
            // This is the magic of Alpine/Vue templates
            var keys = Object.keys(state).filter(k => k !== '$subscribe');
            var args = keys.concat(extra ? Object.keys(extra) : []);
            var values = keys.map(k => state[k]).concat(extra ? Object.values(extra) : []);

            var fn = new Function(args.join(','), 'return ' + expr);
            return fn.apply(state, values);
        } catch (e) {
            console.warn('Mishkah Alpine: Eval error', e);
            return '';
        }
    }

    // Auto-start on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    // -------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------
    return {
        start: start
    };

}));
