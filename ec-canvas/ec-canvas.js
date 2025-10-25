Component({
  properties: {
    id: { type: String, value: 'ec-canvas' },
    canvasId: { type: String, value: 'ec-canvas' },
    width: { type: Number, value: 300 },
    height: { type: Number, value: 200 }
  },
  data: {},
  methods: {
    init(callback) {
      const query = this.createSelectorQuery().in(this)
      query.select('#' + this.data.id).fields({ node: true, size: true }).exec(res => {
        if (!res || !res[0] || !res[0].node) { return }
        const canvas = res[0].node
        const width = res[0].width
        const height = res[0].height
        const dpr = wx.getSystemInfoSync().pixelRatio || 1
        canvas.width = width * dpr
        canvas.height = height * dpr
        if (typeof callback === 'function') callback(canvas, width, height, dpr)
      })
    }
  }
})
