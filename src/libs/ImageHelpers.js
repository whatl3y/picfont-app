import async_waterfall from 'async/waterfall'
import fs from 'fs'
// import * as imagetype from 'image-type'
const imageType = require('image-type')
import * as request from 'request'
import * as lwip from 'pajk-lwip'
import * as exif from 'exif'
import Aws from './Aws'

const s3 = Aws().S3

export default class ImageHelpers {
  constructor(imageInfo) {
    this._image = imageInfo
    this._request = request.defaults({encoding: null})
  }

  open(...args) {
    return new Promise((resolve, reject) => {
      let image = this._image
      let imgType = null
      switch (args.length) {
        case 2:
          image = args[0]
          imgType = args[1]
          break
        case 1:
          image = args[0]
          break
      }

      if (typeof image === 'object' && image != null && image.toString() === '[object Object]')
        return resolve(image)

      if (image instanceof Buffer) {
        return lwip.open(image, imageType(image).ext, (err, image) => {
          if (err) return reject(err)
          return resolve(image)
        })
      }

      if (imgType) {
        return lwip.open(image, imgType, (err, image) => {
          if (err) return reject(err)
          return resolve(image)
        })
      }

      lwip.open(image, (err, image) => {
        if (err) return reject(err)
        return resolve(image)
      })
    })
  }

  clone(image=this._image) {
    return new Promise(async (resolve, reject) => {
      try {
        const lwipImage = await this.open(image)
        lwipImage.clone((err, newImage) => {
          if (err) return reject(err)
          return resolve(newImage)
        })
      } catch(err) {
        reject(err)
      }
    })
  }

  imageToBuffer(...args) {
    return new Promise(async (resolve, reject) => {
      try {
        let type = 'fs'
        let image = this._image
        switch (args.length) {
          case 2:
            type = args[0]
            image = args[1]
            break
          case 1:
            type = args[0]
            break
        }

        // image is already a Buffer
        if (image instanceof Buffer)
          return resolve({imageBuffer: image, imageType: imageType(image).ext})

        switch(type) {
          case 'fs':
            fs.readFile(image, (err, buffer) => {
              if (err) return reject(err)
              return resolve({imageBuffer: buffer, imageType: ImageHelpers.getImageTypeFromFile(image)})
            })
            return

          case 's3':
            const data = await s3.getFile({filename: image})
            return resolve({imageBuffer: data.Body, imageType: ImageHelpers.getImageTypeFromFile(data.Body)})

          case 'url':
            this._request.get(image, (err, httpResponse, body) => {
              if (err) return reject(err)
              if (httpResponse.statusCode !== 200) return reject(body)

              let imgType = httpResponse.headers['content-type']
              imgType = (imgType) ? ImageHelpers.getImageTypeFromFile(`.${imgType.substring(imgType.lastIndexOf('/')+1)}`) : imageType(body).ext
              return resolve({imageBuffer: body, imageType: imgType})
            })
            return

          default:
            return this.imageToBuffer('fs', image)
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  async imageToLwip(...args) {
    let type = 'fs'
    let image = this._image
    switch (args.length) {
      case 2:
        type = args[0]
        image = args[1]
        break
      case 1:
        type = args[0]
        break
    }

    const {imageBuffer, imageType} = await this.imageToBuffer(type, image)
    const lwipImage = await this.open(imageBuffer, imageType)
    return lwipImage
  }

  toBuffer(...args) {
    return new Promise(async (resolve, reject) => {
      try {
        let image = this._image
        let format = 'png'
        let options = null
        switch (args.length) {
          case 3:
            image = args[0]
            format = args[1]
            options = args[2]
            break
          case 2:
            image = args[0]
            format = args[1]
            break
          case 1:
            image = args[0]
            break
        }

        const lwipImage = await this.open(image)

        if (options) {
          lwipImage.toBuffer(format, options, (err, newBuffer) => {
            if (err) return reject(err)
            resolve(newBuffer)
          })
        } else {
          lwipImage.toBuffer(format, (err, newBuffer) => {
            if (err) return reject(err)
            resolve(newBuffer)
          })
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  newImage(...args) {
    return new Promise((resolve, reject) => {
      let width = 500
      let height = 500
      let color = {r:255, g:255, b:255, a:0}
      switch (args.length) {
        case 3:
          width = args[0]
          height = args[1]
          color = args[2]
          break
        case 2:
          width = args[0]
          height = args[1]
          break
        case 1:
          width = args[0]
          height = args[0]
          break
      }

      lwip.create(width, height, color, (err, newImage) => {
        if (err) return reject(err)
        resolve(newImage)
      })
    })
  }

  pasteImages(...args) {
    return new Promise(async (resolve, reject) => {
      try {
        let image = this._image
        let imagesToPaste = []
        switch(args.length) {
          case 2:
            image = args[0]
            imagesToPaste = args[1]
            break
          case 1:
            imagesToPaste = args[0]
            break
        }

        const mainLwipImage = await this.open(image)
        const batch = mainLwipImage.batch()

        await Promise.all(
          imagesToPaste.map(async pasteImage => {
            const lwipImage = await this.open(pasteImage.buffer)
            batch.paste(pasteImage.left, pasteImage.top, lwipImage)
          })
        )

        batch.exec((err, newImage) => {
          if (err) return reject(err)
          resolve(newImage)
        })

      } catch (err) {
        reject(err)
      }
    })
  }

  async uploadSmallImageFromSource(options) {
    const newSize                 = options.size || 250
    const compressAndConvertToJpg = !!(options.jpg || options.jpeg)
    const fileName                = options.filename
    const imageSourceType         = options.source_type
    const imageData               = options.data
    const targetLocation          = options.target || 's3'

    const {imageBuffer, imageType}  = await this.imageToBuffer(imageSourceType, imageData)

    let resizedLwipImage
    if (compressAndConvertToJpg) {
      const resizedLwipBuffer = await this.convertPngToJpeg(imageBuffer, 40, newSize)
      resizedLwipImage        = await this.open(resizedLwipBuffer)
    } else {
      resizedLwipImage        = await this.resizeSameRatio(imageBuffer, newSize)
    }


    const buffer = await this.toBuffer(resizedLwipImage, ImageHelpers.getImageTypeFromFile(fileName), {quality:50})

    let newSmallFileName = null
    switch (targetLocation) {
      case 'gridfs':
        newSmallFileName = await this.uploadFile({filename:fileName, buffer:buffer})
      default:
        newSmallFileName = await s3.writeFile({filename: fileName, data: buffer})
    }
    return newSmallFileName
  }

  async newImageUploadFile(...args) {
    let type = 'gridfs'
    let width = 500
    let height = 500
    let filename = null
    switch (args.length) {
      case 4:
        filename = args[0]
        width = args[1]
        height = args[2]
        type = args[3]
        break
      case 3:
        filename = args[0]
        width = args[1]
        height = args[2]
        break
      case 2:
        filename = args[0]
        width = args[1]
        height = args[1]
        break
      case 1:
        filename = args[0]
        break
    }

    const newImage = await this.newImage(width, height)
    const newBuffer = await this.toBuffer(newImage, 'png')
    if (type === 'raw' || type === 'buffer')
      return newBuffer

    const newFileName = await this.uploadFile({filename:filename, buffer:newBuffer})
    return newFileName
  }

  async dimensions(...args) {
    let image = this._image
    switch (args.length) {
      case 1:
        image = args[0]
        break
    }

    const lwipImage = await this.open(image)
    return [
      lwipImage.width(),
      lwipImage.height()
    ]
  }

  // colorify
  // DESCRIPTION: takes our image and overlays a newly created image
  // of the color 'color' with 50% transparency. Useful to update an
  // image's average color to match closer to what it needs to fit in
  // a mosaic grid
  colorify(...args) {
    return new Promise((resolve, reject) => {
      let image = this._image
      let width = 200
      let height = 200
      let color = 'white'
      switch (args.length) {
        case 4:
          image = args[0]
          width = args[1]
          height = args[2]
          color = args[3]
          break
        case 3:
          width = args[0]
          height = args[1]
          color = args[2]
          break
        case 2:
          width = args[0]
          height = args[0]
          color = args[1]
          break
        case 1:
          width = args[0]
          height = args[0]
          break
      }

      if (typeof color === 'string') {
        if (color[0] === '#')
          color = ImageHelpers.hexToRgb(color)
      }
      // TODO: Determine if the color is completely transparent
      // whether we want to change it to be white since it will be
      // faded by 50%.
      if (color.a === 0) color = {r: 255, g: 255, b: 255, a: 80}

      async_waterfall([
        _callback                         => this.open(image).then(result => _callback(null, result)).catch(_callback),
        (mainImage, _callback)            => lwip.create(width, height, color, (err, newImage) => _callback(err, mainImage, newImage)),
        (mainImage, newImage, _callback)  => newImage.fade(0.5, (err, newNewImage) => _callback(err, mainImage, newNewImage)),
        (mainImage, newImage, _callback)  => mainImage.contain(width, height, (err, newMainImage) => _callback(err, newMainImage, newImage)),
        (mainImage, newImage, _callback)  => mainImage.paste(0, 0, newImage, _callback)
      ],
        (err, finalImage) => {
          if (err) return reject(err)
          return resolve(finalImage)
        }
      )
    })
  }

  // averageImageColor
  // DESCRIPTION: returns a color object ({r:#,g:#,b:#}) that
  // represents that average color of the image
  async averageImageColor(...args) {
    let image = this._image
    let gridNumber = 10
    switch (args.length) {
      case 2:
        image = args[0]
        gridNumber = args[1]
        break
      case 1:
        gridNumber = args[0]
        break
    }

    const lwipImage = await this.open(image)
    const [width, height] = await this.dimensions(lwipImage)
    const dim = {w: width, h: height}
    const gridArray = new Array(gridNumber).fill(0).map((item, _i) => _i + 0.99)

    const nestedColorsForGrid = gridArray.map(_x => {
      return gridArray.map(_y => {
        return lwipImage.getPixel(Math.floor(dim.w * (_x / gridNumber)), Math.floor(dim.h * (_y / gridNumber)))
      })
    })
    const colorsForGrid = [].concat.apply([], nestedColorsForGrid)
    return ImageHelpers.colorAverage(colorsForGrid)
  }

  rotate(...args) {
    return new Promise(async (resolve, reject) => {
      try {
        let image = this._image
        let degrees = args[0]
        switch (args.length) {
          case 2:
            image = args[1]
            break
        }

        const lwipImage = await this.open(image)
        lwipImage.rotate(degrees, (err, rotatedImage) => {
          if (err) return reject(err)
          return resolve(rotatedImage)
        })
      } catch(err) {
        reject(err)
      }
    })
  }

  scale(...args) {
    return new Promise(async (resolve, reject) => {
      let image = this._image
      let wRatio = 1
      let hRatio = 1
      switch (args.length) {
        case 3:
          image = args[0]
          wRatio = args[1]
          hRatio = args[2]
          break
        case 2:
          image = args[0]
          wRatio = args[1]
          hRatio = args[1]
          break
        case 1:
          wRatio = args[0]
          hRatio = args[0]
          break
      }

      const lwipImage = await this.open(image)
      lwipImage.scale(wRatio, hRatio, (err, scaledImage) => {
        if (err) return reject(err)
        resolve(scaledImage)
      })
    })
  }

  crop(...args) {
    return new Promise(async (resolve, reject) => {
      try {
        let image = this._image
        let left = 0
        let top = 0
        let right
        let bottom
        let width
        let height
        switch (args.length) {
          case 5:
            image = args[0]
            left = args[1]
            top = args[2]
            right = args[3]
            bottom = args[4]
            break
          case 4:
            left = args[0]
            top = args[1]
            right = args[2]
            bottom = args[3]
            break
          case 3:
            image = args[0]
            width = args[1]
            height = args[2]
            break
          case 2:
            width = args[0]
            height = args[1]
            break
          case 1:
            width = args[0]
            height = args[0]
            break
        }

        const lwipImage = await this.open(image)
        if (width && height) {
          lwipImage.crop(width, height, (err, croppedImage) => {
            if (err) return reject(err)
            resolve(croppedImage)
          })
        } else {
          lwipImage.crop(left, top, right, bottom, (err, croppedImage) => {
            if (err) return reject(err)
            resolve(croppedImage)
          })
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  fade(...args) {
    return new Promise((resolve, reject) => {
      let image = this._image
      let opacity = 1
      switch (args.length) {
        case 2:
          image = args[0]
          opacity = args[1]
          break
        case 1:
          opacity = args[0]
          break
      }

      image.fade(opacity, (err, fadedImage) => {
        if (err) return reject(err)
        resolve(fadedImage)
      })
    })
  }

  paste(...args) {
    return new Promise((resolve, reject) => {
      let mainImage = this._image
      let imageBeingPastedOntoMain = args[0]
      let left = 0
      let top = 0
      switch (args.length) {
        case 4:
          mainImage = args[0]
          imageBeingPastedOntoMain = args[1]
          left = args[2]
          top = args[3]
        case 2:
          mainImage = args[0]
          imageBeingPastedOntoMain = args[1]
          break
        case 1:
          imageBeingPastedOntoMain = args[0]
          break
      }

      mainImage.paste(left, top, imageBeingPastedOntoMain, (err, newImage) => {
        if (err) return reject(err)
        resolve(newImage)
      })
    })
  }

  async square(...args) {
    let image = this._image
    let area = 'center'
    switch (args.length) {
      case 2:
        image = args[0]
        area = args[1]
        break
      case 1:
        area = args[0]
        break
    }

    const lwipImage = await this.open(image)
    const h = lwipImage.height()
    const w = lwipImage.width()
    const length = ImageHelpers.squareLength(lwipImage)
    let newImage
    switch (area) {
      case 'center':
        newImage = await this.crop(lwipImage, length, length)
        break
      case 'topleft':
        newImage = await this.crop(lwipImage, 1, 1, length, length)
        break
      case 'topright':
        newImage = await this.crop(lwipImage, w - length + 1, 1, w, length)
        break
      case 'bottomleft':
        newImage = await this.crop(lwipImage, 1, h - length + 1, length, h)
        break
      case 'bottomright':
        newImage = await this.crop(lwipImage, w - length + 1, h - length + 1, w, h)
        break
      default:
        newImage = await this.square(lwipImage, 'center')
    }
    return newImage
  }

  async convertPngToJpeg(...args) {
    let image = this._image
    let quality = 50
    let newWidth = null
    switch (args.length) {
      case 3:
        image = args[0]
        quality = args[1]
        newWidth = args[2]
        break
      case 2:
        image = args[0]
        quality = args[1]
        break
      case 1:
        quality = args[0]
        break
    }

    let openedImage = await this.open(image)
    if (newWidth)
      openedImage = await this.resizeSameRatio(openedImage, newWidth)
    let finalImage = await this.toBuffer(openedImage, 'jpg', {quality: quality})
    return finalImage
  }

  resizeSameRatio(...args) {
    return new Promise(async (resolve, reject) => {
      try {
        let image = this._image
        let newWidth
        switch (args.length) {
          case 2:
            image = args[0]
            newWidth = args[1]
            break
          case 1:
            newWidth = args[0]
            break
        }

        const openedImage = await this.open(image)
        const widthHeight = await this.widthHeightRatio(openedImage)
        const newHeight = Math.floor((1/widthHeight) * newWidth)
        openedImage.resize(newWidth, newHeight, (err, newImage) => {
          if (err) return reject(err)
          return resolve(newImage)
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  async widthHeightRatio(...args) {
    let image = this._image
    switch (args.length) {
      case 1:
        image = args[0]
        break
    }

    const lwipImage = await this.open(image)
    const w = lwipImage.width()
    const h = lwipImage.height()
    return w / h
  }

  mirror(...args) {
    return new Promise(async (resolve, reject) => {
      try {
        let image = this._image
        let type = 'y'
        switch (args.length) {
          case 2:
            type = args[0]
            image = args[1]
            break
          case 1:
            type = args[0]
            break
        }

        const lwipImage = await this.open(image)
        lwipImage.mirror(type, (err, rotatedImage) => {
          if (err) return reject(err)
          return resolve(rotatedImage)
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  async rotateImagePerExifOrientation(...args) {
    let type = 'fs'
    let image = this._image
    switch (args.length) {
      case 2:
        type = args[0]
        image = args[1]
        break
      case 1:
        type = args[0]
        break
    }
    const orientMirrorMap = {
      1: [0, false],
      2: [0, true],
      3: [180, false],
      4: [180, true],
      5: [90, true],
      6: [90, false],
      7: [270, true],
      8: [270, false]
    }

    let exifData, imageBuffer
    try {
      const info = await this.getExifMetadata(type, image)
      exifData = info.exifData
      imageBuffer = info.imageBuffer

    } catch (errAndInfo) {
      const err = errAndInfo.error
      if (err.code != 'NO_EXIF_SEGMENT' && err.code != 'NOT_A_JPEG')
        throw err

      exifData = errAndInfo.exifData
      imageBuffer = errAndInfo.imageBuffer
    }

    const orientation             = (exifData) ? exifData.image.Orientation : null
    const lwipImage               = await this.open(imageBuffer)

    if (orientation) {
      const rotatedLwipImage        = await this.rotate(orientMirrorMap[orientation][0], lwipImage)
      const shouldMirror            = orientMirrorMap[orientation][1]
      let finalLwipImage            = rotatedLwipImage
      if (shouldMirror)
        finalLwipImage = await this.mirror('y', rotatedLwipImage)

      return {lwipImg: finalLwipImage , exif: exifData}

    } else {
      return {lwipImg: lwipImage}
    }
  }

  getExifMetadata(...args) {
    return new Promise(async (resolve, reject) => {
      try {
        const ExifImage = exif.ExifImage
        let type = 'fs'
        let image = this._image
        switch (args.length) {
          case 2:
            type = args[0]
            image = args[1]
            break
          case 1:
            type = args[0]
            break
        }

        const {imageBuffer, imageType} = await this.imageToBuffer(type, image)
        new ExifImage({image: imageBuffer}, (err, exifData) => {
          if (err) return reject({error: err, exifData: exifData, imageBuffer: imageBuffer})
          resolve({exifData: exifData, imageBuffer: imageBuffer})
        })
      } catch (err) {
        reject({error: err})
      }
    })
  }

  static async uploadImagesFromFileOrIntegration(imageType, imageUrlorFilePath, fileName=null) {
    const imageHelpers = new ImageHelpers()

    fileName                = fileName  || `uploaded_picture_${imageType}.jpg`
    const {lwipImg, exif}   = (imageType === 'upload')
          ? await imageHelpers.rotateImagePerExifOrientation('fs', imageUrlorFilePath)
          : await imageHelpers.rotateImagePerExifOrientation('url', imageUrlorFilePath)

    const newImageBuffer    = await imageHelpers.toBuffer(lwipImg, 'jpg')
    const [w, h]            = await imageHelpers.dimensions(lwipImg)
    const orientation       = (w / h > 1) ? 'landscape' : 'portrait'

    const [mainS3FileName, smallerS3FileName, tinyS3FileName] = await Promise.all([
      s3.writeFile({filename: fileName, data: newImageBuffer}),
      imageHelpers.uploadSmallImageFromSource({jpg: true, filename: fileName, data: newImageBuffer, size: 400}),
      imageHelpers.uploadSmallImageFromSource({jpg: true, filename: fileName, data: newImageBuffer, size: 150}),
    ])
    return [mainS3FileName, smallerS3FileName, tinyS3FileName, orientation, exif]
  }

  static getFileName(fileName, extraText=Date.now()) {
    const lastPeriod = fileName.lastIndexOf(".")
    return `${fileName.substring(0, lastPeriod)}_${extraText}${fileName.substring(lastPeriod)}`
  }

  static getImageTypeFromFile(fileName) {
    if (typeof fileName === 'string') {
      const paramIndex = fileName.indexOf('?')
      if (paramIndex > -1) {
        fileName = fileName.substring(0,paramIndex)
      }
      const extension = fileName.substring(fileName.lastIndexOf('.')+1)
      return ((extension === 'jpeg') ? 'jpg' : (extension || 'jpg')).toLowerCase()
    }
    return 'jpg'
  }

  static colorAverage(colorArray) {
    let rgbSum = colorArray.reduce((memo, color) => {
      if (typeof color === 'string') color = ImageHelpers.hexToRgb(color)
      memo.r += color.r
      memo.g += color.g
      memo.b += color.b
      memo.a += (typeof color.a !== 'undefined') ? ((color.a === 0) ? 0 : (color.a || 100)) : 100
      return memo
    }, {r:0, g:0, b:0, a:0})

    rgbSum.r = Math.round(rgbSum.r / colorArray.length)
    rgbSum.g = Math.round(rgbSum.g / colorArray.length)
    rgbSum.b = Math.round(rgbSum.b / colorArray.length)
    rgbSum.a = Math.round(rgbSum.a / colorArray.length)
    return rgbSum
  }

  static squareLength(image, larger=false) {
    const width = image.width()
    const height = image.height()
    return (width < height)
      ? ((larger) ? height : width)
      : ((larger) ? width : height)
  }

  static hexToRgb(hexColor='#000000') {
    hexColor = ImageHelpers.hexToSix(hexColor)
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor)
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null
  }

  static rgbToHex(r=0, g=0, b=0) {
    if (typeof r === 'object') {
      g = r.g
      b = r.b
      r = r.r
    }
    return "#" + ImageHelpers.componentToHex(r) + ImageHelpers.componentToHex(g) + ImageHelpers.componentToHex(b)
  }

  static componentToHex(c) {
    const hex = c.toString(16)
    return hex.length == 1 ? "0" + hex : hex
  }

  static hexToSix(hex='#000') {
    hex = hex.replace('#','')
    if (hex.length === 3) {
      return '#' + hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
    }
    return hex
  }

  static sleep(timeoutMs=1000) {
    return new Promise(resolve => setTimeout(resolve, timeoutMs))
  }
}
