import assert from 'assert'
import path from 'path'
import ImageHelpers from './ImageHelpers'

describe('ImageHelpers', () => {
  const imagePath           = path.join('.', 'src', 'tests', 'beach.jpg')
  const expectedFileTypeJpg = 'jpg'
  const imageHelpers        = new ImageHelpers(imagePath)

  const imagePathPng        = path.join('.', 'src', 'tests', 'beach.png')
  const expectedFileTypePng = 'png'
  const imageHelpersPng     = new ImageHelpers(imagePathPng)

  describe('#open()', () => {
    it('should open image without error', async () => {
      const lwipImage = await imageHelpers.open()
      assert.equal(typeof lwipImage, 'object')
    })
  })

  describe('#imageToBuffer()', () => {
    it('should convert image to Buffer object', async () => {
      const {imageBuffer, imageType} = await imageHelpers.imageToBuffer('fs', imagePath)
      assert.equal(typeof imageBuffer, 'object')
      assert.equal(imageBuffer instanceof Buffer, true)
      assert.equal(imageType, expectedFileTypeJpg)
    })
  })

  describe('#toBuffer()', () => {
    it('should convert image to Buffer object', async () => {
      const imageBuffer = await imageHelpers.toBuffer(imagePath)
      assert.equal(typeof imageBuffer, 'object')
      assert.equal(imageBuffer instanceof Buffer, true)
    })
  })

  describe('#newImageUploadFile()', async () => {
    it('should create a new image of specified size', async () => {
      const newImageBuffer = await imageHelpers.newImageUploadFile('test', 500, 500, 'raw')
      const newLwipImage = await imageHelpers.open(newImageBuffer)
      const randomX = Math.floor(Math.random() * 500)
      const randomY = Math.floor(Math.random() * 500)
      const colorAtPixel = newLwipImage.getPixel(randomX, randomY)

      assert.equal(newLwipImage.width(), 500)
      assert.equal(newLwipImage.height(), 500)
      assert.equal(colorAtPixel.r, 255)
      assert.equal(colorAtPixel.g, 255)
      assert.equal(colorAtPixel.b, 255)
      assert.equal(colorAtPixel.a, 0)
    })
  })

  describe('#dimensions()', async () => {
    it('should get valid dimensions of image', async () => {
      const lwipImage             = await imageHelpers.open(imagePath)
      const [width, height]       = [lwipImage.width(), lwipImage.height()]
      const [widthDim, heightDim] = await imageHelpers.dimensions(imagePath)
      assert.equal(width, widthDim)
      assert.equal(height, heightDim)
    })
  })

  describe('#colorify()', async () => {
    it('should change the images color more towards a target color specified', async () => {
      const originalImage = await imageHelpers.open()
      const targetColor = '#000000' // black
      const colorifiedImage = await imageHelpers.colorify(100, targetColor)
      const [width, height] = await imageHelpers.dimensions(colorifiedImage)

      const origAvgColor = await imageHelpers.averageImageColor(originalImage, 10)
      const newAvgColor = await imageHelpers.averageImageColor(colorifiedImage, 10)

      assert.equal(width, 100)
      assert.equal(height, 100)
      assert.equal(origAvgColor.r >= newAvgColor.r, true)
      assert.equal(origAvgColor.g >= newAvgColor.g, true)
      assert.equal(origAvgColor.b >= newAvgColor.b, true)
    })
  })

  describe('#convertPngToJpeg()', () => {
    it('should convert a png to a jpg image and compress it based on quality', async () => {
      const originalImageBuffer       = await imageHelpersPng.toBuffer()
      const origImageData             = await imageHelpersPng.imageToBuffer('buffer', originalImageBuffer)
      const newJpg75Quality           = await imageHelpersPng.convertPngToJpeg(imageHelpersPng._image, 75)
      const imageData75Quality        = await imageHelpersPng.imageToBuffer('buffer', newJpg75Quality)
      const newJpg50Quality           = await imageHelpersPng.convertPngToJpeg(imageHelpersPng._image, 50)
      const imageData50Quality        = await imageHelpersPng.imageToBuffer('buffer', newJpg50Quality)
      const newJpg25Quality           = await imageHelpersPng.convertPngToJpeg(imageHelpersPng._image, 25)
      const imageData25Quality        = await imageHelpersPng.imageToBuffer('buffer', newJpg25Quality)
      const newJpg25Quality50Width    = await imageHelpersPng.convertPngToJpeg(imageHelpersPng._image, 25, 50)
      const imageData25Quality50Width = await imageHelpersPng.imageToBuffer('buffer', newJpg25Quality50Width)

      // test the MIME types
      assert.equal('png', origImageData.imageType)
      assert.equal('jpg', imageData75Quality.imageType)
      assert.equal('jpg', imageData50Quality.imageType)
      assert.equal('jpg', imageData25Quality.imageType)
      assert.equal('jpg', imageData25Quality50Width.imageType)

      // test buffer sizes of converted images
      assert.equal(true, originalImageBuffer.length > newJpg75Quality.length)
      assert.equal(true, newJpg75Quality.length > newJpg50Quality.length)
      assert.equal(true, newJpg50Quality.length > newJpg25Quality.length)
      assert.equal(true, newJpg25Quality.length > newJpg25Quality50Width.length)

      // test size of new image with specified width
      const opened25Quality50WidthImage = await imageHelpersPng.open(newJpg25Quality50Width)
      assert.equal(50, opened25Quality50WidthImage.width())
    })
  })

  describe('#resizeSameRatio()', () => {
    it('should resize image and maintain same ratio as before', async () => {
      const [originalWidth, originalHeight] = await imageHelpers.dimensions(imagePath)
      const originalRatio = originalWidth / originalHeight
      const newImage = await imageHelpers.resizeSameRatio(imagePath, 100)
      const [newWidth, newHeight] = await imageHelpers.dimensions(newImage)
      const newRatio = newWidth / newHeight

      const ratio = originalRatio / newRatio
      const ratioError = 1 - ((ratio > 1) ? 1 / ratio : ratio)

      assert.equal(ratioError < 0.005, true)
      assert.equal(newWidth, 100)
    })
  })

  describe('#rotate()', () => {
    it('should rotate the image by specified degrees', async () => {
      const [origWidth, origHeight] = await imageHelpers.dimensions(imagePath)
      const rotatedImage = await imageHelpers.rotate(90, imagePath)
      const [newWidth, newHeight] = await imageHelpers.dimensions(rotatedImage)

      assert.equal(origWidth, newHeight)
      assert.equal(origHeight, newWidth)
    })
  })

  describe('#square()', async () => {
    it('should make the image square based on the lowest dimension', async () => {
      const dimensions = await imageHelpers.dimensions(imagePath)
      const squareLength = (dimensions[0] > dimensions[1]) ? dimensions[1] : dimensions[0]
      const newImage1 = await imageHelpers.square(imagePath, 'center')
      const newImage2 = await imageHelpers.square(imagePath, 'topleft')
      const newImage3 = await imageHelpers.square(imagePath, 'topright')
      const newImage4 = await imageHelpers.square(imagePath, 'bottomleft')
      const newImage5 = await imageHelpers.square(imagePath, 'bottomright')
      assert.equal(squareLength, newImage1.width())
      assert.equal(squareLength, newImage1.height())
      assert.equal(squareLength, newImage2.width())
      assert.equal(squareLength, newImage2.height())
      assert.equal(squareLength, newImage3.width())
      assert.equal(squareLength, newImage3.height())
      assert.equal(squareLength, newImage4.width())
      assert.equal(squareLength, newImage4.height())
      assert.equal(squareLength, newImage5.width())
      assert.equal(squareLength, newImage5.height())
    })
  })

  describe('static #squareLength()', () => {
    it('should return the length of the shortest side', async () => {
      const [width, height] = await imageHelpers.dimensions(imagePath)
      const squareLength1 = (width > height) ? height : width
      const lwipImage = await imageHelpers.open(imagePath)
      const squareLength2 = ImageHelpers.squareLength(lwipImage)
      assert.equal(squareLength1, squareLength2)
    })
  })

  describe('static #averageImageColor()', () => {
    it('should evaluate to a valid color', async () => {
      const avgColor = await imageHelpers.averageImageColor(imagePath, 5)

      assert.equal(typeof avgColor, 'object')
      assert.equal(avgColor.r >= 0 && avgColor.r <= 255, true)
      assert.equal(avgColor.g >= 0 && avgColor.g <= 255, true)
      assert.equal(avgColor.b >= 0 && avgColor.b <= 255, true)
      assert.equal(avgColor.a >= 0 && avgColor.a <= 100, true)
    })
  })

  describe('static #rgbToHex()', () => {
    it(`should return '#000000' when provided rgb values of 0,0,0`, () => {
      assert.equal('#000000', ImageHelpers.rgbToHex(0,0,0))
      assert.equal('#000000', ImageHelpers.rgbToHex({r:0, g:0, b:0}))
    })

    it(`should return '#FFFFFF' when provided rgb values of 255,255,255`, () => {
      assert.equal('#FFFFFF'.toLowerCase(), ImageHelpers.rgbToHex(255,255,255).toLowerCase())
      assert.equal('#FFFFFF'.toLowerCase(), ImageHelpers.rgbToHex({r:255, g:255, b:255}).toLowerCase())
    })
  })

  describe('static #hexToRgb()', () => {
    it(`should return {r:0, g:0, b:0} when provided hex value of '#000000'`, () => {
      assert.equal(0, ImageHelpers.hexToRgb('#000000').r)
      assert.equal(0, ImageHelpers.hexToRgb('#000000').g)
      assert.equal(0, ImageHelpers.hexToRgb('#000000').b)
    })

    it(`should return {r:255, g:255, b:255} when provided hex value of '#FFFFFF'`, () => {
      assert.equal(255, ImageHelpers.hexToRgb('#FFFFFF').r)
      assert.equal(255, ImageHelpers.hexToRgb('#FFFFFF').g)
      assert.equal(255, ImageHelpers.hexToRgb('#FFFFFF').b)
    })
  })
})
