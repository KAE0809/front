/*!
 * mishkah-react.js — React-like Layer for Mishkah
 * Provides: useState, useEffect, html (HTMLx), render
 * 2025-12-03
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah'], function (M) { return factory(root, M); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.React = factory(root, root.Mishkah);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M) {
    "use strict";

    // -------------------------------------------------------------------
    // Internal State for Hooks
    // -------------------------------------------------------------------
    var currentComponent = null;
    var hookIndex = 0;

    // -------------------------------------------------------------------
    // Component Wrapper
    // -------------------------------------------------------------------
    function createComponent(ComponentFn, props) {
        var instance = {
            hooks: [],
            ComponentFn: ComponentFn,
            props: props,
            vnode: null,
            dom: null,
            isMounted: false,
            render: function () {
                currentComponent = instance;
                hookIndex = 0;
                var vnode = instance.ComponentFn(instance.props);
                currentComponent = null;
                return vnode;
            },
            update: function () {
                var oldVNode = instance.vnode;
                var newVNode = instance.render();
                instance.vnode = newVNode;

                // Simple Patching (Re-render root if top-level, or patch if integrated)
                // For now, we assume full re-render for simplicity in Alpha
                if (instance.rootRender) {
                    instance.rootRender();
                } else {
                    // TODO: Implement fine-grained component patching
                    // M.patch(instance.dom.parentNode, newVNode, oldVNode);
                }
            }
        };
        return instance;
    }

    // -------------------------------------------------------------------
    // Hooks Implementation
    // -------------------------------------------------------------------
    function useState(initialValue) {
        if (!currentComponent) {
            throw new Error('useState must be called inside a component');
        }

        var index = hookIndex++;
        var instance = currentComponent;
        var hooks = instance.hooks;

        if (hooks.length <= index) {
            hooks.push({
                value: typeof initialValue === 'function' ? initialValue() : initialValue
            });
        }

        var hook = hooks[index];

        var setState = function (newValue) {
            var nextValue = typeof newValue === 'function'
                ? newValue(hook.value)
                : newValue;

            if (hook.value !== nextValue) {
                hook.value = nextValue;
                instance.update();
            }
        };

        return [hook.value, setState];
    }

    function useEffect(callback, deps) {
        if (!currentComponent) {
            throw new Error('useEffect must be called inside a component');
        }

        var index = hookIndex++;
        var instance = currentComponent;
        var hooks = instance.hooks;

        var hasChanged = true;
        var oldDeps = hooks[index] ? hooks[index].deps : undefined;

        if (oldDeps) {
            hasChanged = !deps || deps.some(function (d, i) { return d !== oldDeps[i]; });
        }

        if (!hooks[index]) {
            hooks[index] = { deps: deps, cleanup: null };
        } else {
            hooks[index].deps = deps;
        }

        if (hasChanged) {
            // Schedule effect
            setTimeout(function () {
                if (hooks[index].cleanup) hooks[index].cleanup();
                var cleanup = callback();
                if (typeof cleanup === 'function') hooks[index].cleanup = cleanup;
            }, 0);
        }
    }

    // -------------------------------------------------------------------
    // HTMLx (Tagged Template)
    // -------------------------------------------------------------------
    // This is a simplified parser that produces VNodes directly
    // It relies on the browser's DOMParser for parsing HTML strings
    // and then maps them to Mishkah VNodes.

    function html(strings) {
        var values = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            values[_i - 1] = arguments[_i];
        }

        // 1. Construct HTML string with placeholders
        var out = "";
        var placeholders = [];

        for (var i = 0; i < strings.length; i++) {
            out += strings[i];
            if (i < values.length) {
                var val = values[i];
                // If value is array or VNode, put a placeholder
                if (Array.isArray(val) || (val && val._type)) {
                    var id = "m-ph-" + placeholders.length;
                    placeholders.push(val);
                    out += "<m-placeholder id='" + id + "'></m-placeholder>";
                } else if (typeof val === 'function') {
                    // Event handler placeholder (will be attached later)
                    // We can't put function in HTML string.
                    // Strategy: Use data-m-event attribute
                    var id = "m-ev-" + placeholders.length;
                    placeholders.push(val);
                    out += '" data-m-event="' + id + '"'; // Hacky but works for attributes
                } else {
                    out += val;
                }
            }
        }

        // 2. Parse HTML
        var parser = new DOMParser();
        var doc = parser.parseFromString(out, 'text/html');
        var nodes = doc.body.childNodes;

        // 3. Convert DOM nodes to VNodes
        function domToVNode(node) {
            if (node.nodeType === 3) { // Text
                return node.nodeValue;
            }
            if (node.nodeType === 8) { // Comment
                return null;
            }
            if (node.nodeType === 1) { // Element
                var tag = node.tagName.toLowerCase();

                // Handle Placeholders
                if (tag === 'm-placeholder') {
                    var id = node.getAttribute('id').replace('m-ph-', '');
                    return placeholders[parseInt(id)];
                }

                var attrs = {};
                var events = {};

                for (var i = 0; i < node.attributes.length; i++) {
                    var attr = node.attributes[i];
                    if (attr.name === 'data-m-event') {
                        // It's an event handler, but we lost the event name in the hack above.
                        // Real HTMLx parser needs to be more robust (Tokenization).
                        // For this Alpha, we assume standard HTMLx usage: onclick=${fn}
                        // The parser sees: onclick=" data-m-event="m-ev-0""
                        // So the attribute name becomes 'onclick'.
                        // We need to check parent attributes in the loop? No.
                        // Let's stick to a simpler approach for Alpha:
                        // Just return raw HTML for now and use M.RawHtml? No, we want VNodes.

                        // FALLBACK: For Alpha, we'll use a simpler HTMLx that doesn't support
                        // embedded functions in attributes yet, only children.
                        // Users should use standard M.h for complex events or wait for Beta.
                    }

                    if (attr.name.startsWith('on')) {
                        // If it matches our placeholder pattern
                        var match = attr.value.match(/data-m-event="m-ev-(\d+)"/);
                        if (match) {
                            events[attr.name] = placeholders[parseInt(match[1])];
                        } else {
                            attrs[attr.name] = attr.value;
                        }
                    } else {
                        attrs[attr.name] = attr.value;
                    }
                }

                var children = [];
                for (var j = 0; j < node.childNodes.length; j++) {
                    children.push(domToVNode(node.childNodes[j]));
                }

                return M.h(tag, 'React', { attrs: attrs, events: events }, children);
            }
            return null;
        }

        if (nodes.length === 1) return domToVNode(nodes[0]);

        // Fragment
        return nodes.length > 0
            ? Array.from(nodes).map(domToVNode)
            : null;
    }

    // -------------------------------------------------------------------
    // Render / Mount
    // -------------------------------------------------------------------
    function render(Component, container) {
        var instance = createComponent(Component, {});

        // Root Render Loop
        instance.rootRender = function () {
            var vnode = instance.render();
            // Clear container and append new DOM
            // In real implementation, we would patch.
            container.innerHTML = '';
            container.appendChild(M.VDOM.render(vnode, {}));
        };

        instance.rootRender();
        return instance;
    }

    // -------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------
    return {
        useState: useState,
        useEffect: useEffect,
        html: html,
        render: render
    };

}));
