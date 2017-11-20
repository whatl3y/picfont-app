export default {
  getImageUrl(urlOrObject, whichImage=false, type='s3') {
    if (!urlOrObject) return ''
    if (typeof urlOrObject === 'string') return `/file/${type}/${urlOrObject}`

    const finalSrc = ((whichImage) ? urlOrObject[whichImage] : (urlOrObject.mini || urlOrObject.small)) || urlOrObject.small || urlOrObject.mini || urlOrObject.main || null
    if (finalSrc)
      return `/file/${type}/${finalSrc}`
    return ''
  },

  createFileReader(callback) {
    if (FileReader) {
      var fr = new FileReader()
      fr.addEventListener("load", () => callback(fr, fr.result), false)
      return fr
    } else {
      console.log('FileReader is not on the page...')
      return false
    }
  }
}
