/*!
 * mishkah-angular.js — Angular-like Layer for Mishkah
 * Provides: bootstrap, Component (Class-based)
 * 2025-12-03
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['mishkah', 'mishkah-react'], function (M, R) { return factory(root, M, R); });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('mishkah'), require('mishkah-react'));
    } else {
        root.Mishkah = root.Mishkah || {};
        root.Mishkah.Angular = factory(root, root.Mishkah, root.Mishkah.React);
    }
}(typeof window !== 'undefined' ? window : this, function (global, M, R) {
    "use strict";

    if (!R || !R.render) {
        console.error('Mishkah.Angular requires Mishkah.React (mishkah-react.js).');
        return {};
    }

    // -------------------------------------------------------------------
    // Angular-like Class Wrapper
    // -------------------------------------------------------------------
    function bootstrap(ComponentClass, selector) {

        function AngularComponent(props) {
            // 1. Force Update Hook
            var tickHook = R.useState(0);
            var setTick = tickHook[1];

            // 2. Create Instance (Once)
            // We wrap it in a Proxy to detect property changes
            var instanceHook = R.useState(function () {
                var rawInstance = new ComponentClass();

                // Bind methods to the proxy (we'll create the proxy next)
                // But we need the proxy reference first. 
                // JS doesn't allow accessing variable before init.
                // So we create a "handler" that will delegate to the proxy later?
                // Simpler: Just create the proxy and bind methods to it.

                var proxy = new Proxy(rawInstance, {
                    set: function (target, prop, value) {
                        target[prop] = value;
                        // Trigger re-render on any property change
                        setTick(function (t) { return t + 1; });
                        return true;
                    },
                    get: function (target, prop) {
                        // Auto-bind methods
                        var value = target[prop];
                        if (typeof value === 'function') {
                            return value.bind(proxy);
                        }
                        return value;
                    }
                });

                // Initialize props if any
                if (props) {
                    Object.assign(proxy, props);
                }

                return proxy;
            });

            var instance = instanceHook[0];

            // 3. Lifecycle: onInit (mapped to useEffect [])
            R.useEffect(function () {
                if (instance.onInit) {
                    instance.onInit();
                }
                return function () {
                    if (instance.onDestroy) instance.onDestroy();
                };
            }, []);

            // 4. Render Template
            // Angular templates are usually strings, but here we use html`` tag result
            // stored in static 'template' property.
            // We need to execute it with 'this' context as the instance.

            var template = ComponentClass.template;

            if (!template) {
                return M.h('div', 'Angular', {}, ['No template defined']);
            }

            // If template is a function (html`` wrapper), call it
            if (typeof template === 'function') {
                return template.call(instance);
            }

            // If template is just a VNode (static), return it
            return template;
        }

        // Mount
        var container = typeof selector === 'string'
            ? document.querySelector(selector)
            : selector;

        // If no selector provided, we assume we just return the component for composition
        if (!selector) return AngularComponent;

        R.render(AngularComponent, container);
    }

    // -------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------
    return {
        bootstrap: bootstrap,
        html: R.html
    };

}));
