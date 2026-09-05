import nodePolyFills from 'rollup-plugin-polyfill-node'

const production = process.env.NODE_ENV === 'production'

/**
 * @type {import('vite').UserConfig}
 */
const config = {
    server: {
        port: 3000,
        strictPort: true
    },

    plugins: [
        !production && nodePolyFills({
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
        // Needed for legacy ethers/Web3Modal dependencies.
        commonjsOptions: {
            transformMixedEsModules: true
        }
    }
}

export default config