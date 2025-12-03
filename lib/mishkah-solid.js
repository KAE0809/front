/*!
 * mishkah-solid.js — SolidJS (Signals) Layer for Mishkah
 * Provides: createSignal, createEffect, createMemo, createComponent
 * 2025-12-03
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah', 'mishkah-react'], function (M, R) { return factory(root, M, R); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'), require('mishkah-react'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.Solid = factory(root, root.Mishkah, root.Mishkah.React);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M, R) {
    "use strict";

    if (!R || !R.render) {
        console.error('Mishkah.Solid requires Mishkah.React (mishkah-react.js).');
        return {};
    }

    // -------------------------------------------------------------------
    // SolidJS Signals Emulation (Runtime)
    // -------------------------------------------------------------------

    // 1. createSignal
    function createSignal(initialValue) {
        // In Solid, signals are independent of components.
        // But in our VDOM emulation, we need to trigger re-renders.
        // We use React's useState for the "trigger", but keep value external?
        // Actually, to support "fine-grained" feel, we just use useState
        // and return [getter, setter].

        var hook = R.useState(initialValue);
        var val = hook[0];
        var setVal = hook[1];

        var getter = function () { return val; };
        var setter = function (newValue) {
            // Support function update: setSignal(c => c + 1)
            if (typeof newValue === 'function') {
                setVal(function (prev) { return newValue(prev); });
            } else {
                setVal(newValue);
            }
        };

        return [getter, setter];
    }

    // 2. createEffect
    function createEffect(fn) {
        // Solid effects run automatically when dependencies change.
        // In this runtime emulation, we don't track dependencies automatically.
        // So we just run it on every render (useEffect with no deps).
        // This is less efficient than real Solid, but correct for emulation.
        R.useEffect(fn);
    }

    // 3. createMemo (Derived)
    function createMemo(fn) {
        // Simple derived value
        return function () { return fn(); };
    }

    // 4. render (Mount)
    function render(ComponentFn, target) {
        // Solid components run once.
        // BUT, since we are emulating via React/VDOM, our components MUST re-run to produce new VNodes.
        // So we just pass the component to R.render.
        // The user writes "Solid-style" code (signals), but it runs like React.

        R.render(ComponentFn, target);
    }

    // 5. Show/For (Control Flow Components)
    // Solid uses components for control flow.
    // We can implement simple versions.

    function Show(props) {
        // props.when is a boolean or getter?
        // In our emulation, it's likely a value passed from parent re-render.
        var condition = typeof props.when === 'function' ? props.when() : props.when;
        return condition ? props.children : (props.fallback || null);
    }

    function For(props) {
        var list = typeof props.each === 'function' ? props.each() : props.each;
        if (!Array.isArray(list)) return null;

        // props.children is a function: (item, index) => ...
        // In HTMLx, children are usually VNodes.
        // We need to support function as child for <For>
        // But M.h normalizes children.
        // Let's assume user calls it like: For({ each: list, children: (item) => ... })

        if (typeof props.children === 'function') {
            return list.map(props.children);
        }
        return null;
    }

    // -------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------
    return {
        createSignal: createSignal,
        createEffect: createEffect,
        createMemo: createMemo,
        render: render,
        html: R.html,
        // Components
        Show: Show,
        For: For
    };

}));
