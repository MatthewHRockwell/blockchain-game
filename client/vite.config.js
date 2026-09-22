import nodePolyFills from 'rollup-plugin-polyfill-node'

/**
 * `vite build --mode e2e` produces a normal production bundle that additionally
 * exposes the window.__LOST_TEMPLE_GAME__ test hook, so the end-to-end harness in
 * scripts/ can introspect scene state against the built output. In every other mode
 * __E2E_HOOK__ is the literal `false` and the hook is dropped by dead-code removal.
 *
 * @type {import('vite').UserConfigFn}
 */
const config = ({ command, mode }) => ({
    server: {
        port: 3000,
        strictPort: true
    },

    define: {
        __E2E_HOOK__: JSON.stringify(mode === 'e2e')
    },

    plugins: [
        // Dev server only; the build gets its own instance below. Keyed off `command`
        // rather than NODE_ENV so that a non-default --mode does not add a second,
        // conflicting copy of the plugin.
        command === 'serve' && nodePolyFills({
            include: ['node_modules/**/*.js', new RegExp('node_modules/.vite/.*js')]
        })
    ],

    build: {
        rollupOptions: {
            plugins: [
                // ↓ Needed for build
                nodePolyFills()
            ]
        },
        // Needed for legacy ethers v5 CommonJS dependencies.
        commonjsOptions: {
            transformMixedEsModules: true
        }
    }
})

export default config
