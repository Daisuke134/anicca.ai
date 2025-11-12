const { configure } = require('quasar/wrappers')
const path = require('path')

module.exports = configure(function (ctx) {
  return {
    supportTS: false,

    boot: [],

    css: [
      'app.css'
    ],

    extras: [
      'material-icons'
    ],

    build: {
      vueRouterMode: 'hash',

      distDir: path.resolve(__dirname, '../dist/ui'),

      publicPath: './',

      extendWebpack (cfg) {
        cfg.resolve.alias = {
          ...cfg.resolve.alias,
          '@': path.resolve(__dirname, 'src')
        }
      }
    },

    devServer: {
      open: false
    },

    framework: {
      config: {},

      plugins: [
        'Notify',
        'Dialog'
      ]
    }
  }
})
